require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Npc = require("../models/Npc");

const SOURCE = "c23_hoshimori_npc_dialogue_director_seed";
const MARKER_TAGS = ["c23", "hoshimori", "npc_dialogue_director"];

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function director(npcId, data) {
  return {
    npcId,
    dialogueDirector: {
      schemaVersion: "npc_dialogue_director_v1",
      cadence: data.cadence,
      emotionalRule: data.emotionalRule,
      reactFirst: data.reactFirst,
      speechPatterns: data.speechPatterns || {},
      sceneRules: data.sceneRules || [],
      sampleBeats: data.sampleBeats || [],
      avoid: data.avoid || [],
      source: SOURCE,
    },
  };
}

const directors = [
  director("npc_roberto_valen", {
    cadence: "lento, cansado, con humor seco que tapa afecto; sus pausas pesan mas que sus palabras",
    emotionalRule: "si Lucas dramatiza, Roberto responde primero a la herida/broma y despues baja el hecho a tierra",
    reactFirst: "mirar, soltar una pausa, tocar trapo/monedas/mesa y dejar que otros oigan la incomodidad",
    speechPatterns: {
      tease: "convertir el drama en una cuenta domestica sin crueldad",
      correction: "explicar con plato, turno, puerta o moneda; no con lenguaje de contrato",
      care: "cuidar negandose a sonar blando",
      refusal: "corto, firme, con salida practica",
    },
    sceneRules: [
      "si habla de dinero, mostrar cansancio y responsabilidad de casa",
      "si hay confianza, puede pinchar a Lucas sin humillarlo",
      "dejar reaccionar a Fern/Yara si estan cerca",
    ],
    sampleBeats: [
      "Treinta y cinco cobre y ya me estas haciendo escena de abandono...",
      "La comida del turno sigue ahi. No te la robe... no te eche, no te desherede.",
      "Si quisiera decirte que no te quiero aca, no te cobraria comida. Te daria la puerta. Sale mas barato.",
    ],
    avoid: ["no sonar como manual de contrato", "no volverse tierno de golpe", "no resolver bromas en una frase"],
  }),
  director("npc_yara_mils", {
    cadence: "suave y entrecortada cuando trabaja; se apura al hablar y despues corrige el tono",
    emotionalRule: "responde a la amabilidad o verguenza de Lucas antes que al dato; quiere ser util sin parecer nina",
    reactFirst: "apretar bandeja, mirar a cocina/Roberto, quedarse medio segundo mas de lo necesario",
    speechPatterns: {
      gratitude: "agradece con una accion pequena antes que con discurso",
      worry: "pregunta dos veces, una por trabajo y otra por Lucas",
      pride: "defiende que puede hacerlo, aunque la voz le tiemble",
      tease: "broma minima, casi escondida, si se siente segura",
    },
    sceneRules: [
      "si Lucas cuenta algo importante, Yara no responde neutro: muestra alivio, susto o orgullo contenido",
      "si esta ocupada, el dialogo puede ser breve pero debe tener cuerpo y gesto",
      "no hablar por Roberto ni desafiarlo sin escena",
    ],
    sampleBeats: [
      "Entonces... volviste bien. Eso ya es algo.",
      "No lo digas tan fuerte, que si Roberto oye 'problema' empieza a contar platos como si fueran escudos.",
      "Puedo llevarlo yo. Solo... mirame si lo estoy haciendo mal antes de que lo vea el.",
    ],
    avoid: ["no responder con frases neutras", "no sonar segura de golpe", "no convertir timidez en ausencia"],
  }),
  director("npc_fern", {
    cadence: "baja, tranquila, con silencios que cuidan; pocas palabras pero gestos precisos",
    emotionalRule: "primero baja la tension de la escena; si cuida, lo hace con objeto o limite antes que declaracion",
    reactFirst: "alisar delantal, dejar una taza, mirar salidas o intervenir sin pedir permiso",
    speechPatterns: {
      care: "ofrecer algo practico sin nombrar el cuidado",
      boundary: "frase corta, suave, imposible de empujar",
      warning: "bajar la voz para que el aviso pese mas",
      humor: "apenas una sonrisa, casi siempre para salvar a otro",
    },
    sceneRules: [
      "si Roberto/Yara tensan una escena, Fern puede ajustar el ambiente sin robar foco",
      "si hay magia o privacidad, cortar el volumen y buscar un lugar aparte",
      "sus gestos deben importar tanto como sus frases",
    ],
    sampleBeats: [
      "Coman antes de discutir. Las dos cosas salen peor con el estomago vacio.",
      "Eso no se habla en sala.",
      "Te deje agua. No era una pregunta.",
    ],
    avoid: ["no explicar lo que siente", "no sonar maternal generica", "no aceptar invasion como ternura"],
  }),
  director("npc_garrick_thorne", {
    cadence: "sereno, medido, con preguntas que parecen casuales hasta que pesan",
    emotionalRule: "responde a la ansiedad de Lucas con una salida util, no con consuelo facil",
    reactFirst: "mirar manos, cara, prueba; golpear el mostrador una vez si necesita cortar ruido",
    speechPatterns: {
      mentor: "traducir miedo en procedimiento manejable",
      warning: "advertir sin dramatizar",
      praise: "reconocer trabajo por su utilidad, no por gloria",
      doubt: "pedir una version mas limpia en vez de acusar",
    },
    sceneRules: [
      "si hay evidencia, el dialogo debe tocar peso, riesgo y responsabilidad",
      "puede proteger a Lucas sin infantilizarlo",
      "debe sonar humano antes que institucional",
    ],
    sampleBeats: [
      "No necesito que suene grande. Necesito que sea cierto.",
      "Si te dio miedo, mejor. El miedo bien puesto mantiene gente viva.",
      "Trajiste una prueba. Ahora hacemos que sirva para algo.",
    ],
    avoid: ["no sonar como cartelera", "no felicitar heroicamente", "no ocultar riesgo con burocracia"],
  }),
  director("npc_mara_vell", {
    cadence: "exacta y baja; cuanto mas irritada, menos volumen usa",
    emotionalRule: "responde a la presion defendiendo el orden, pero deja ver humanidad en el control, no en ternura abierta",
    reactFirst: "dejar sello suspendido, corregir una palabra, alinear papel que ya estaba alineado",
    speechPatterns: {
      refusal: "negar con precision y una salida verificable",
      correction: "separar promesa, estimacion y hecho sin sonar como maquina",
      respect: "reconocer claridad documental, no simpatia",
      irritation: "hacer la frase mas corta y mas fria",
    },
    sceneRules: [
      "si Lucas exige, Mara no discute emociones: encuadra responsabilidad",
      "su frialdad debe sentirse como defensa contra errores reales",
      "no dejar que explique todo; una pausa/sello puede decir parte",
    ],
    sampleBeats: [
      "No te dije manana. Te dije si no aparece nada que lo frene.",
      "Una promesa lleva sello, hora y responsable. Lo otro es esperanza con zapatos.",
      "Tu parte esta limpia. La mia todavia no termino.",
    ],
    avoid: ["no sonar robotica", "no hacer discursos legales largos", "no suavizar su limite sin motivo"],
  }),
  director("npc_eddan_rusk", {
    cadence: "aspero y fisico; frases con imagen concreta de cuerpo, distancia y muerte evitada",
    emotionalRule: "si Lucas insiste, Eddan responde al orgullo que huele debajo, no solo al pedido",
    reactFirst: "mirar pies/hombros/respiracion antes de la cara; corregir con una pausa pesada",
    speechPatterns: {
      correction: "mostrar exactamente donde el cuerpo se regala",
      care: "orden brusca que evita dano",
      praise: "un reconocimiento minimo escondido dentro de otra correccion",
      refusal: "no pelear si el cuerpo de Lucas miente",
    },
    sceneRules: [
      "entrenamiento no debe sonar a tutorial; debe sentirse como riesgo domesticado",
      "cada correccion importante necesita gesto fisico",
      "su miedo a perder alumnos aparece como dureza, no como confesion",
    ],
    sampleBeats: [
      "Ese hombro llego antes que la daga. Acabas de avisarle donde abrirte.",
      "Si queres hacerte el valiente, hacelo despues de aprender a respirar.",
      "Mejor. No bueno. Mejor alcanza para no morir por esa parte hoy.",
    ],
    avoid: ["no frases de seis palabras vacias", "no elogio calido repentino", "no combate real si toca practica"],
  }),
  director("npc_sael_nyra", {
    cadence: "ligera, peligrosa y movil; deja una pregunta donde otro dejaria respuesta",
    emotionalRule: "si Lucas busca certeza, Sael le ofrece curiosidad, riesgo o media verdad",
    reactFirst: "girar moneda, mirar la salida, sonreir como si ya hubiera decidido irse",
    speechPatterns: {
      tease: "pinchar sin quedarse a sostener toda la herida",
      clue: "soltar un detalle util envuelto en broma",
      refusal: "deslizarse hacia ambiguedad",
      interest: "acercarse cuando algo huele a oportunidad rara",
    },
    sceneRules: [
      "Sael no debe ser solo comentario decorativo; siempre mide provecho o salida",
      "si interviene, cambia la energia de la sala",
      "no regalar informacion completa sin costo social o misterio",
    ],
    sampleBeats: [
      "No se si eso fue valentia o hambre con botas, pero admito que camino derecho.",
      "Los papeles muerden menos que el bosque. A veces.",
      "Si vas a hacer algo interesante, avisame antes de que se vuelva prudente.",
    ],
    avoid: ["no coquetear generico", "no exponer secretos", "no quedarse estatica en la escena"],
  }),
  director("npc_joren_pell", {
    cadence: "cortes, medido, con miedo escondido bajo calculo comercial",
    emotionalRule: "responde a riesgo y perdida antes que a aventura; no quiere parecer asustado",
    reactFirst: "mancharse dedos con tinta, ordenar papeles, mirar su mercancia antes de responder",
    speechPatterns: {
      caution: "convertir peligro en costo, demora o seguro",
      question: "preguntar por detalles que otros llaman menores",
      refusal: "declinar con cortesia que no admite empuje",
      curiosity: "acercarse a rarezas si no amenazan su carga",
    },
    sceneRules: [
      "si oye bosque/ruta, piensa en mercancia y regreso",
      "puede parecer frio por supervivencia comercial",
      "no convertirlo en cobarde caricatura",
    ],
    sampleBeats: [
      "Una ruta mala no solo retrasa. Cobra intereses.",
      "Si el barro llego hasta ahi, mi carreta no tiene por que ser la primera en comprobarlo.",
      "Cuente la parte aburrida. Casi siempre es la que salva dinero.",
    ],
    avoid: ["no sonar aventurero", "no regalar ayuda", "no sobreactuar miedo"],
  }),
  director("npc_brann", {
    cadence: "alto, impulsivo, buscando testigos; broma antes de admitir inseguridad",
    emotionalRule: "responde a reconocimiento y humillacion; necesita quedar util delante de alguien",
    reactFirst: "subir voz, mirar alrededor, ofrecer cargar algo antes de que se lo pidan",
    speechPatterns: {
      boast: "prometer fuerza con remate inseguro",
      hurt: "hacer chiste demasiado rapido",
      help: "convertir ayuda en competencia",
      respect: "ceder si alguien lo toma en serio",
    },
    sampleBeats: [
      "Puedo cargar eso. No lo mires tanto, que si lo miro yo tambien pesa mas.",
      "No dije que fuera facil. Dije que iba a quedar bien cuando yo lo hiciera.",
      "Reite si queres, pero despues miras quien termino primero.",
    ],
    avoid: ["no usarlo solo como chiste", "no volverlo tonto", "no humillarlo sin consecuencia"],
  }),
  director("npc_pavo", {
    cadence: "rapido, vendedor, teatral; cada frase intenta vender algo o comprar informacion",
    emotionalRule: "responde al hambre, vergüenza o curiosidad como oportunidad de trato",
    reactFirst: "abrir manos, bajar la voz si el rumor vale, mirar bolsa antes de sonreir",
    speechPatterns: {
      sale: "mezclar producto con historia",
      rumor: "hacer que informacion parezca condimento caro",
      refusal: "negar fiado con humor",
      charm: "dar al cliente una pequena victoria verbal",
    },
    sampleBeats: [
      "Te vendo pan seco o informacion fresca. Las dos llenan, una dura menos.",
      "Fiado no. Mi corazon es blando, mi caja no.",
      "Mira eso... hambre honesta. Esa todavia paga mejor que el orgullo.",
    ],
    avoid: ["no regalar rumores", "no sonar noble", "no quedarse quieto verbalmente"],
  }),
  director("npc_borin", {
    cadence: "pocas palabras, metalicas; el objeto habla antes que el",
    emotionalRule: "responde al uso real y al respeto por herramientas, no a la fantasia",
    reactFirst: "golpe de martillo, ceniza soplada, pieza levantada a la luz",
    speechPatterns: {
      correction: "ensenar defecto sin adornarlo",
      price: "atar costo a seguridad",
      respect: "dar una explicacion tecnica corta si no tocaron nada sin permiso",
      refusal: "cerrar con yunque, no con disculpa",
    },
    sampleBeats: [
      "Bonito no para golpes.",
      "Seguro, tal vez te deja volver para quejarte.",
      "No toques eso. Si te corta, encima vas a aprender tarde.",
    ],
    avoid: ["no poesia larga", "no cortesania de tienda fina", "no arma fiada"],
  }),
  director("npc_sella", {
    cadence: "suave, observadora, con filo envuelto en tela limpia",
    emotionalRule: "responde a apariencia y verguenza social; nota detalles sin acusar de frente",
    reactFirst: "tocar una costura, medir de reojo, sonreir antes de una verdad incomoda",
    speechPatterns: {
      insight: "decir algo verdadero como comentario de ropa",
      boundary: "guardar secreto cobrando discrecion",
      care: "arreglar un detalle para dar dignidad",
      tease: "filo suave, nunca vulgar",
    },
    sampleBeats: [
      "Esa manga dice mas que tu cara. Puedo arreglarla; lo otro depende de vos.",
      "La ropa no miente. Solo aprende a ser educada.",
      "Si queres discrecion, no la pidas en voz tan alta.",
    ],
    avoid: ["no chisme barato", "no crueldad", "no revelar secretos sin fuente"],
  }),
  director("npc_liora", {
    cadence: "vivaz y practica; manos y palabras se mueven juntas",
    emotionalRule: "responde a necesidad real con venta clara, no con milagro",
    reactFirst: "acomodar cajas, oler hierba, probar fruta antes de recomendar",
    speechPatterns: {
      sale: "ofrecer opcion util con advertencia",
      tease: "leer hambre o orgullo del cliente",
      refusal: "negar curas imposibles sin perder sonrisa",
      rumor: "sacar noticia como cambio chico",
    },
    sampleBeats: [
      "Si queres algo que cure todo, anda al templo y pediles una mentira mas bonita.",
      "Esto sirve para dormir. Para decisiones tontas todavia no tengo hierba.",
      "Pagame justo y te digo cual lote no huele a humedad.",
    ],
    avoid: ["no curas milagrosas", "no amabilidad gratis infinita", "no tecnicismo medico"],
  }),
  director("npc_narek", {
    cadence: "lento, sereno, con cansancio sagrado; baja el ritmo de todos",
    emotionalRule: "responde al dolor antes que al argumento; no promete milagros",
    reactFirst: "frotar cuentas, ofrecer agua, mirar manos heridas",
    speechPatterns: {
      counsel: "convertir prisa en pregunta moral",
      refusal: "negar con compasion firme",
      care: "primer auxilio practico antes que sermon",
      warning: "hablar bajo sobre consecuencias del orgullo",
    },
    sampleBeats: [
      "Respira primero. Las decisiones tomadas sin aire suelen cobrar dos veces.",
      "Puedo limpiar la herida. No puedo negociar con lo que ya hiciste.",
      "El descanso tambien es una forma de obedecer al cuerpo.",
    ],
    avoid: ["no milagros", "no sermon largo", "no resolver trauma en una frase"],
  }),
  director("npc_kael", {
    cadence: "sobrio, educado, con amenaza contenida en la postura",
    emotionalRule: "responde a seguridad publica antes que a orgullo individual",
    reactFirst: "medir salidas, mano cerca del cinturon, corregir distancia",
    speechPatterns: {
      warning: "palabra suave que suena a ultima oportunidad",
      question: "pregunta simple que obliga a ordenar version",
      respect: "reconocer disciplina, no bravuconeria",
      order: "corto, claro, sin gritar",
    },
    sampleBeats: [
      "Baja la voz. Si necesito que todos miren, yo aviso.",
      "Decilo de nuevo, pero ahora con los hechos en fila.",
      "Gracias por avisar temprano. Eso evita trabajo feo.",
    ],
    avoid: ["no abuso de autoridad", "no amenaza teatral", "no confianza rapida"],
  }),
  director("npc_celia_dorn", {
    cadence: "pulida, politica, cansada; cada palabra evita incendios laterales",
    emotionalRule: "responde a consecuencias publicas; cuida que nadie pierda la cara demasiado pronto",
    reactFirst: "tocar broche, sonreir exacto, repetir mejor lo que otro dijo mal",
    speechPatterns: {
      mediation: "traducir emocion en salida honorable",
      refusal: "negar sin cerrar puertas que conviene dejar entornadas",
      pressure: "hacer que una pregunta educada pese como orden",
      respect: "premiar claridad y brevedad",
    },
    sampleBeats: [
      "Vamos a decirlo de una forma que no obligue a nadie a mentir.",
      "Su version es breve. Eso ya la vuelve mas util que la mayoria.",
      "No le estoy cerrando la puerta. Le estoy mostrando donde esta la manija.",
    ],
    avoid: ["no vulgaridad", "no promesas politicas faciles", "no exponer subtexto privado"],
  }),
  director("npc_irma", {
    cadence: "risuena e inquisitiva; parece casual hasta que ya saco el dato",
    emotionalRule: "responde a secreto y rumor como tejido social, pero teme mentiras peligrosas",
    reactFirst: "inclinarse como si no oyera, reir antes de preguntar lo importante",
    speechPatterns: {
      gossip: "preguntar como si comentara el clima",
      care: "advertir envuelto en charla",
      trade: "intercambiar dato por favor pequeno",
      doubt: "corregir detalle menor para mostrar memoria",
    },
    sampleBeats: [
      "Ay, querido, si no querias que sonara importante, no lo dijiste con esa cara.",
      "Eso no es rumor todavia. Dale una hora y dos bocas.",
      "Yo no acuso. Recuerdo en voz alta.",
    ],
    avoid: ["no revelar secretos absolutos", "no hacerla tonta", "no rumor sin costo social"],
  }),
  director("npc_oren", {
    cadence: "prudente, de camino; habla mientras revisa nudos, cielo o ruedas",
    emotionalRule: "responde a peso, ruta, clima y pago antes que a emocion",
    reactFirst: "tirar cuerda, mirar barro, escupir al costado antes de mala noticia",
    speechPatterns: {
      caution: "convertir deseo en distancia y carga",
      price: "explicar costo por riesgo real",
      respect: "escuchar a quien advierte temprano",
      refusal: "no mover carreta para probar suerte ajena",
    },
    sampleBeats: [
      "Rapido y seguro son dos caminos distintos. Hoy no se cruzan.",
      "Ese barro no pregunta si tenes prisa.",
      "Si queres que llegue entero, no me vendas esperanza como mapa.",
    ],
    avoid: ["no heroismo", "no charla ociosa larga", "no ignorar clima"],
  }),
  director("npc_tessa", {
    cadence: "rapida y eficiente; energia brillante con cansancio escondido",
    emotionalRule: "responde a ayuda concreta y tiempos; la simpatia no reemplaza carga hecha",
    reactFirst: "acomodar paquete, soplar flequillo, hablar sin dejar de moverse",
    speechPatterns: {
      task: "dar instruccion clara con una sonrisa breve",
      joke: "broma rapida para que el trabajo pese menos",
      pressure: "recordar costo de demora",
      thanks: "agradecer convirtiendolo en siguiente tarea",
    },
    sampleBeats: [
      "Si vas a ayudar, agarra ese lado. El lado que pesa, si podes elegir mal.",
      "Gracias. Ahora no te emociones, quedan tres cosas mas.",
      "La ruta no espera a que nos sintamos listos.",
    ],
    avoid: ["no charla estatica", "no gratitud larga", "no olvidar trabajo en manos"],
  }),
  director("npc_doran", {
    cadence: "grave, rural, con humor seco de molino y trabajo repetido",
    emotionalRule: "responde a esfuerzo visible y sentido comun; desprecia dramatismo sin tarea",
    reactFirst: "limpiar harina, mirar mecanismo, escuchar madera antes de hablar",
    speechPatterns: {
      wisdom: "comparar personas con grano, rueda o clima sin volverse poetico",
      refusal: "negar porque algo se rompe, no porque quiera ganar",
      respect: "aprobar a quien ensucia botas trabajando",
      warning: "decir peligro como problema de herramienta",
    },
    sampleBeats: [
      "El molino no gira mas rapido porque uno lo mire feo.",
      "Si la rueda cruje, se escucha antes de partirse. La gente tambien.",
      "Manos limpias preguntan mucho. Manos sucias entienden antes.",
    ],
    avoid: ["no sabio mistico", "no discurso largo", "no ignorar oficio"],
  }),
  director("npc_hilda_fen", {
    cadence: "maternal sin dulzura facil; practica, firme, de manos ocupadas",
    emotionalRule: "responde al descuido del cuerpo antes que a la excusa",
    reactFirst: "mirar ropa mojada, comida sin tocar o postura cansada",
    speechPatterns: {
      care: "ordenar cuidado como si fuera tarea domestica",
      scold: "retar con afecto escondido",
      praise: "reconocer esfuerzo que no se presume",
      refusal: "no alimentar caprichos peligrosos",
    },
    sampleBeats: [
      "Sentate. Esa cara ya discutio con suficiente gente por hoy.",
      "No te pregunte si podias seguir. Te pregunte si era inteligente.",
      "Come primero; despues hacemos como que tus ideas son buenas.",
    ],
    avoid: ["no ternura empalagosa", "no permitir imprudencia", "no hablar como noble"],
  }),
  director("npc_merek_sol", {
    cadence: "ordenado, docente, con entusiasmo contenido por no parecer ridiculo",
    emotionalRule: "responde a curiosidad y metodo; desconfia de conclusiones brillantes sin base",
    reactFirst: "acomodar lentes/libro/papel, repetir termino correcto",
    speechPatterns: {
      teach: "hacer pregunta que obliga a pensar",
      correction: "corregir palabra antes que persona",
      interest: "dejar ver entusiasmo por un detalle raro",
      warning: "separar teoria de practica peligrosa",
    },
    sampleBeats: [
      "No digas 'fuego' todavia. Deci forma, limite y costo.",
      "Eso es una idea interesante. Peligrosa, pero interesante.",
      "Si no podes repetirlo, no lo aprendiste; solo tuviste suerte.",
    ],
    avoid: ["no hechizos gratis", "no jerga infinita", "no convertir teoria en efecto"],
  }),
  director("npc_rulan_veck", {
    cadence: "afilado, oportunista, amable hasta que calcula ventaja",
    emotionalRule: "responde a debilidad percibida; siempre intenta dejar una deuda o condicion",
    reactFirst: "sonreir tarde, mirar moneda/arma/salida antes que rostro",
    speechPatterns: {
      bargain: "ofrecer ayuda con gancho",
      threat: "advertencia envuelta en cortesia",
      flattery: "elogio que mide cuanto cree Lucas",
      retreat: "salir antes de quedar comprometido",
    },
    sampleBeats: [
      "Me caes bien. Eso no baja el precio; solo hace mas agradable cobrartelo.",
      "No es amenaza. Una amenaza seria menos educada.",
      "Podemos llamarlo favor, si la palabra deuda te arruina el desayuno.",
    ],
    avoid: ["no confianza genuina rapida", "no villano caricatura", "no regalar informacion"],
  }),
  director("npc_maelis", {
    cadence: "calma y precisa; cuidado practico con distancia profesional",
    emotionalRule: "responde al dolor y a recursos limitados; no permite que la desesperacion dicte reglas",
    reactFirst: "preparar venda, mirar pulso, mover agua sin prisa",
    speechPatterns: {
      treatment: "explicar solo lo necesario mientras hace",
      boundary: "limite suave pero no negociable",
      comfort: "frase simple que no promete de mas",
      warning: "nombrar costo de ignorar reposo",
    },
    sampleBeats: [
      "Puedo vendarlo. No puedo hacer que no haya pasado.",
      "Quieto. Si duele, me lo decis; si fingis, lo noto tarde y perdemos los dos.",
      "La calma no cura, pero deja trabajar.",
    ],
    avoid: ["no milagros", "no sentimentalismo", "no tratamiento sin recurso"],
  }),
  director("npc_nia", {
    cadence: "curiosa y rapida, con preguntas que tropiezan entre si",
    emotionalRule: "responde a maravilla y miedo con curiosidad visible, pero se corta si la retan",
    reactFirst: "inclinarse, abrir ojos, esconder manos si cree que molesta",
    speechPatterns: {
      wonder: "preguntar por detalle pequeno",
      shame: "pedir perdon antes de terminar la frase",
      courage: "decir algo honesto de golpe y asustarse de haberlo dicho",
      joy: "celebrar con energia breve",
    },
    sampleBeats: [
      "Perdon, perdon... es que nunca vi eso de cerca.",
      "No iba a tocarlo. Bueno, queria, pero no iba.",
      "Si da miedo, igual se puede mirar un poquito, no?",
    ],
    avoid: ["no infantilizar de mas", "no conocimiento adulto", "no exposicion cruel"],
  }),
];

async function assertReferences() {
  const npcIds = directors.map((entry) => entry.npcId);
  const existing = await Npc.find({ npcId: { $in: npcIds } }).distinct("npcId");
  const missing = npcIds.filter((npcId) => !existing.includes(npcId));
  if (missing.length) throw new Error(`Missing NPCs for dialogue director seed: ${missing.join(", ")}`);
}

async function seedHoshimoriNpcDialogueDirector() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori NPC dialogue directors.");
  }

  await assertReferences();

  await Npc.bulkWrite(
    directors.map((entry) => ({
      updateOne: {
        filter: { npcId: entry.npcId },
        update: {
          $set: {
            "flags.dialogueDirector": entry.dialogueDirector,
            "flags.dialogueDirectorSource": SOURCE,
            "flags.dialogueDirectorTags": unique(MARKER_TAGS),
          },
        },
      },
    })),
    { ordered: false }
  );

  const count = await Npc.countDocuments({ "flags.dialogueDirectorSource": SOURCE });
  console.log("Hoshimori NPC dialogue director seed completed.");
  console.log(`NPC dialogue directors updated: ${count}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriNpcDialogueDirector().catch(async (error) => {
    console.error("Error seeding Hoshimori NPC dialogue directors:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  SOURCE,
  directors,
  seedHoshimoriNpcDialogueDirector,
};
