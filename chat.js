import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Necesario para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DEFINICIÓN DE HERRAMIENTAS ---
const herramientasRPG = {
  functionDeclarations: [
    {
      name: "iniciarAventura",
      description:
        "Crea el personaje del jugador con un nombre, vida inicial de 100 y un arma inicial. Guarda el estado en el archivo JSON.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombre: {
            type: "STRING",
            description: "El nombre del personaje del jugador.",
          },
          armaInicial: {
            type: "STRING",
            description:
              "El arma inicial del personaje (ej: espada de madera, daga oxidada, bastón mágico).",
          },
        },
        required: ["nombre", "armaInicial"],
      },
    },
    {
      name: "atacar",
      description:
        "El jugador ataca a un enemigo con su arma actual. Genera daño aleatorio entre 10 y 40 puntos.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombreEnemigo: {
            type: "STRING",
            description: "El nombre del enemigo al que se ataca.",
          },
        },
        required: ["nombreEnemigo"],
      },
    },
    {
      name: "explorarZona",
      description:
        "El agente describe un nuevo lugar que el jugador descubre, como un bosque, cueva, castillo, pantano, etc.",
      parameters: {
        type: "OBJECT",
        properties: {
          tipoZona: {
            type: "STRING",
            enum: [
              "bosque",
              "cueva",
              "castillo",
              "pantano",
              "aldea",
              "montaña",
              "ruinas",
            ],
            description: "El tipo de zona que el jugador va a explorar.",
          },
        },
        required: ["tipoZona"],
      },
    },
    {
      name: "recogerObjeto",
      description:
        "Añade un objeto o arma al inventario del jugador y guarda el cambio en el archivo JSON.",
      parameters: {
        type: "OBJECT",
        properties: {
          objeto: {
            type: "STRING",
            description:
              "El nombre del objeto o arma a recoger (ej: poción de vida, espada flamígera, escudo élfico).",
          },
        },
        required: ["objeto"],
      },
    },
    {
      name: "mostrarInventario",
      description:
        "Muestra en consola el nombre del jugador, su vida actual y todos los objetos en su inventario.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: [],
      },
    },
    {
      name: "huir",
      description:
        "El jugador escapa del combate. Pierde 10 puntos de vida como penalización por huir.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombreEnemigo: {
            type: "STRING",
            description: "El nombre del enemigo del que el jugador está huyendo.",
          },
        },
        required: ["nombreEnemigo"],
      },
    },
  ],
};

// --- IMPLEMENTACIÓN DE HERRAMIENTAS ---
const executableTools = {
  // Crea al jugador y guarda su estado inicial en el JSON
  iniciarAventura: (args) => {
    const { nombre, armaInicial } = args;
    const data = loadHistory();

    // Inicializar el estado del jugador con vida 100 e inventario con el arma inicial
    data.jugador = {
      nombre: nombre,
      vida: 100,
      inventario: [armaInicial],
    };

    saveHistory(data);
    console.log(
      `\n⚔️  [AVENTURA INICIADA]: ¡Bienvenido, ${nombre}! Comienzas tu aventura con "${armaInicial}" y 100 puntos de vida.\n`
    );
    return { status: "success", jugador: data.jugador };
  },

  // El jugador ataca con su arma, el daño es aleatorio entre 10 y 40
  atacar: (args) => {
    const { nombreEnemigo } = args;
    const data = loadHistory();

    // Usar el primer objeto del inventario como arma equipada
    const armaEquipada = data.jugador?.inventario?.[0] || "puños";

    // Generar daño aleatorio entre 10 y 40 puntos
    const daño = Math.floor(Math.random() * 31) + 10;

    console.log(
      `\n🗡️  [ATAQUE]: ${data.jugador?.nombre || "El jugador"} ataca a ${nombreEnemigo} con "${armaEquipada}" causando ${daño} puntos de daño!\n`
    );
    return {
      status: "success",
      dañoInfligido: daño,
      armaUsada: armaEquipada,
      enemigo: nombreEnemigo,
    };
  },

  // Describe una zona nueva que el jugador descubre
  explorarZona: (args) => {
    const { tipoZona } = args;

    // Descripciones narrativas por tipo de zona
    const descripciones = {
      bosque:
        "Un denso bosque donde los rayos de sol apenas atraviesan el follaje. Se escuchan crujidos entre los arbustos y el olor a tierra húmeda impregna el aire...",
      cueva:
        "Una oscura cueva de piedra húmeda. El eco de tus pasos resuena en las paredes y algo brilla misteriosamente en la oscuridad más profunda.",
      castillo:
        "Un imponente castillo en ruinas cuyas torres desgastadas tocan las nubes. Las puertas de hierro oxidadas crujen al abrirse lentamente.",
      pantano:
        "Un tétrico pantano donde una niebla espesa cubre el suelo lodoso. Luces fantasmales flotan en la distancia y algo se mueve bajo el agua negra.",
      aldea:
        "Una pequeña aldea de campesinos con aspecto asustadizo. Las casas tienen las puertas cerradas con trancas. Parece que algo los tiene aterrorizados.",
      montaña:
        "Una majestuosa montaña nevada. El viento gélido azota tu rostro mientras asciendes por el camino rocoso lleno de peligros ocultos.",
      ruinas:
        "Antiguas ruinas de una civilización olvidada hace siglos. Inscripciones místicas cubren los muros derrumbados y el aire vibra con energía arcana.",
    };

    const descripcion =
      descripciones[tipoZona] || "Una zona desconocida llena de misterio y peligro.";
    console.log(
      `\n🗺️  [EXPLORACIÓN - ${tipoZona.toUpperCase()}]: ${descripcion}\n`
    );
    return { status: "success", zona: tipoZona, descripcion };
  },

  // Añade un objeto al inventario del jugador y lo persiste en el JSON
  recogerObjeto: (args) => {
    const { objeto } = args;
    const data = loadHistory();

    // Verificar que exista un jugador activo antes de añadir al inventario
    if (!data.jugador) {
      console.log(
        `\n❌ [ERROR]: No hay un jugador activo. Primero inicia la aventura.\n`
      );
      return {
        status: "error",
        message: "No hay un jugador activo. Primero inicia la aventura.",
      };
    }

    // Agregar el objeto al inventario y guardar el estado actualizado
    data.jugador.inventario.push(objeto);
    saveHistory(data);

    console.log(`\n🎒 [OBJETO RECOGIDO]: Has añadido "${objeto}" a tu inventario.\n`);
    return {
      status: "success",
      objetoRecogido: objeto,
      inventarioActual: data.jugador.inventario,
    };
  },

  // Imprime en consola el estado completo del jugador
  mostrarInventario: (_args) => {
    const data = loadHistory();

    if (!data.jugador) {
      console.log(
        `\n📋 [INVENTARIO]: No hay ningún jugador activo. Inicia una aventura primero.\n`
      );
      return { status: "error", message: "No hay jugador activo." };
    }

    const { nombre, vida, inventario } = data.jugador;
    console.log(`\n📋 [INVENTARIO DE ${nombre.toUpperCase()}]`);
    console.log(`   ❤️  Vida: ${vida}/100`);
    console.log(`   🎒 Objetos (${inventario.length}):`);
    inventario.forEach((item, i) => console.log(`      ${i + 1}. ${item}`));
    console.log();

    return { status: "success", jugador: { nombre, vida, inventario } };
  },

  // El jugador huye del combate y pierde 10 puntos de vida como penalización
  huir: (args) => {
    const { nombreEnemigo } = args;
    const data = loadHistory();

    if (!data.jugador) {
      return { status: "error", message: "No hay un jugador activo." };
    }

    // Aplicar penalización de 10 puntos de vida, sin bajar de 0
    data.jugador.vida = Math.max(0, data.jugador.vida - 10);
    saveHistory(data);

    console.log(
      `\n💨 [HUIDA]: ${data.jugador.nombre} huye de ${nombreEnemigo}! Pierde 10 puntos de vida como penalización.`
    );
    console.log(`   ❤️  Vida restante: ${data.jugador.vida}/100\n`);

    return {
      status: "success",
      vidaRestante: data.jugador.vida,
      mensaje: `Huiste de ${nombreEnemigo} perdiendo 10 puntos de vida.`,
    };
  },
};

// --- CONFIGURACIÓN DEL MODELO ---
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  tools: [herramientasRPG],
  // Instrucción del sistema: obliga al modelo a usar las herramientas en cada acción del jugador
  systemInstruction: `Eres el narrador de un juego de rol de aventura de texto. 
SIEMPRE debes usar las herramientas disponibles cuando el jugador realice las siguientes acciones:
- Cuando el jugador diga su nombre o quiera empezar/iniciar la aventura → llama a iniciarAventura con su nombre y un arma inicial apropiada.
- Cuando el jugador quiera atacar a un enemigo → llama a atacar con el nombre del enemigo.
- Cuando el jugador quiera explorar un lugar → llama a explorarZona con el tipo de zona más apropiado.
- Cuando el jugador quiera recoger, tomar o guardar un objeto → llama a recogerObjeto con el nombre del objeto.
- Cuando el jugador quiera ver su inventario, estado o vida → llama a mostrarInventario.
- Cuando el jugador quiera huir o escapar de un combate → llama a huir con el nombre del enemigo.
Nunca respondas solo con texto si el jugador está realizando una de estas acciones. Siempre llama primero a la herramienta correspondiente y luego narra el resultado de forma épica y dramática.`,
});

const historyPath = "./chat_history.json";

// --- UTILIDADES ---
// Carga el historial y el estado del jugador desde el archivo JSON
function loadHistory() {
  if (!fs.existsSync(historyPath)) {
    return {
      messages: [],
      jugador: null,
      params: { temperature: 0.9, top_p: 0.95, max_output_tokens: 1000 },
      total_tokens_acumulados: 0,
    };
  }
  return JSON.parse(fs.readFileSync(historyPath, "utf-8"));
}

// Guarda el historial y el estado del jugador en el archivo JSON
function saveHistory(data) {
  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

// --- LÓGICA DE CHAT ---
async function chat(userMessage) {
  const data = loadHistory();

  // Variables para acumular tokens de toda la interacción
  let totalEntrada = 0;
  let totalSalida = 0;

  // Formatear el historial de mensajes para la API de Gemini
  const formattedHistory = data.messages.map((m) => ({
    role: m.role === "assistant" || m.role === "model" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chatSession = model.startChat({
    history: formattedHistory,
    generationConfig: {
      temperature: data.params.temperature,
    },
  });

  try {
    // Primera llamada: el modelo decide si usar una herramienta o responder directamente
    const result = await chatSession.sendMessage(userMessage);

    // Conteo de tokens de la primera llamada
    totalEntrada += result.response.usageMetadata.promptTokenCount;
    totalSalida += result.response.usageMetadata.candidatesTokenCount;

    const response = result.response;
    const call = response.candidates[0].content.parts.find(
      (p) => p.functionCall
    );

    let finalResponseText = "";

    if (call) {
      // El modelo invocó una herramienta: ejecutarla y devolver el resultado
      const { name, args } = call.functionCall;
      const toolResult = executableTools[name](args);

      try {
        // Segunda llamada: enviar el resultado de la herramienta al modelo para que genere la respuesta final
        const secondResponse = await chatSession.sendMessage([
          {
            functionResponse: {
              name: name,
              response: toolResult,
            },
          },
        ]);

        // Conteo de tokens de la segunda llamada (cuando se usó herramienta)
        totalEntrada += secondResponse.response.usageMetadata?.promptTokenCount || 0;
        totalSalida  += secondResponse.response.usageMetadata?.candidatesTokenCount || 0;

        finalResponseText = secondResponse.response.text();
      } catch (secondErr) {
        // Si la segunda llamada falla (ej: límite de cuota), igual mostrar que la herramienta se ejecutó
        console.error("Error en segunda llamada:", secondErr.message);
        finalResponseText = `[Herramienta ejecutada: ${name}] ${toolResult.mensaje || JSON.stringify(toolResult)}`;
      }
    } else {
      // No se usó herramienta: la respuesta viene directamente del modelo
      finalResponseText = response.text();
    }

    // Mostrar el conteo de tokens en consola (formato solicitado)
    console.log(`\n[Tokens] Entrada: ${totalEntrada} | Salida: ${totalSalida}`);

    // Actualizar el historial de mensajes y los tokens acumulados
    data.messages.push({ role: "user", content: userMessage });
    data.messages.push({ role: "model", content: finalResponseText });
    data.total_tokens_acumulados =
      (data.total_tokens_acumulados || 0) + totalEntrada + totalSalida;

    saveHistory(data);

    // Retornar texto y tokens para que el servidor Express los envíe al frontend
    return { text: finalResponseText, entrada: totalEntrada, salida: totalSalida };
  } catch (error) {
    console.error("Error en la petición:", error);
    return { text: "Lo siento, hubo un error procesando la herramienta.", entrada: 0, salida: 0 };
  }
}

// --- SERVIDOR EXPRESS ---
const app = express();
const PORT = 3000;

// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Endpoint POST /api/chat — recibe el mensaje del jugador y retorna la respuesta del narrador
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "El mensaje no puede estar vacío." });
  }

  try {
    const respuesta = await chat(message);
    // Leer el estado actualizado del jugador para enviarlo al frontend
    const data = loadHistory();
    res.json({
      response: respuesta.text,
      jugador: data.jugador,
      tokens: data.total_tokens_acumulados,
      tokensEntrada: respuesta.entrada,
      tokensSalida: respuesta.salida,
    });
  } catch (error) {
    console.error("Error en /api/chat:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Endpoint GET /api/status — retorna el estado actual del jugador
app.get("/api/status", (req, res) => {
  const data = loadHistory();
  res.json({
    jugador: data.jugador,
    tokens: data.total_tokens_acumulados,
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log("===========================================");
  console.log("   🏰 AGENTE RPG DE AVENTURA DE TEXTO 🏰   ");
  console.log("===========================================");
  console.log(`🌐 Servidor corriendo en http://localhost:${PORT}`);
  console.log("===========================================");
});
