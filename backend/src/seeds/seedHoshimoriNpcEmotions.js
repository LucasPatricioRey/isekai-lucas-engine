require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Npc = require("../models/Npc");
const NpcRelationship = require("../models/NpcRelationship");

const SOURCE = "c15_hoshimori_npc_emotions_seed";
const MARKER_TAGS = ["c15", "hoshimori", "npc_emotions"];

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizePair(npcAId, npcBId) {
  return [npcAId, npcBId].sort();
}

function profile(npcId, data) {
  return {
    npcId,
    emotionalProfile: {
      schemaVersion: "emotional_profile_v1",
      defaultMood: data.defaultMood || "",
      coreDrives: data.coreDrives || [],
      coreFears: data.coreFears || [],
      pride: data.pride || "",
      softSpots: data.softSpots || [],
      stressors: data.stressors || [],
      visibleTells: data.visibleTells || [],
      copingStyle: data.copingStyle || "",
      contradiction: data.contradiction || "",
      sceneHooks: data.sceneHooks || [],
      notes: `source:${SOURCE}`,
    },
  };
}

function relationship(npcAId, npcBId, data) {
  const [a, b] = normalizePair(npcAId, npcBId);
  return {
    npcAId: a,
    npcBId: b,
    emotionalTone: data.emotionalTone || "",
    publicTensionReason: data.publicTensionReason || "",
    privateSubtext: data.privateSubtext || "",
    interactionHints: data.interactionHints || [],
    boundaries: data.boundaries || [],
    tags: unique([...MARKER_TAGS, SOURCE, ...(data.tags || [])]),
  };
}

const emotionalProfiles = [
  profile("npc_roberto_valen", {
    defaultMood: "seco atento, cansado de sostener mas de lo que dice",
    coreDrives: ["mantener la posada estable", "proteger a su gente sin ablandarse", "que las deudas no devoren la casa"],
    coreFears: ["fallar como dueno cuando otros dependen de el", "que la compasion arruine las cuentas"],
    pride: "Que La Grulla Azul siga funcionando incluso en semanas malas.",
    softSpots: ["trabajadores hambrientos que no se quejan", "gente que paga sus deudas sin excusas"],
    stressors: ["clientes que ensucian y no pagan", "promesas vagas", "ruido cuando esta calculando cuentas"],
    visibleTells: ["aprieta el puente de la nariz", "revisa monedas dos veces", "responde sin levantar la vista"],
    copingStyle: "trabaja mas y habla menos; convierte preocupacion en orden practico.",
    contradiction: "Parece duro con Lucas, pero su dureza suele ser una forma de no dejar que alguien se hunda en la posada.",
    sceneHooks: ["corrige una mesa torcida mientras escucha", "corta una discusion con una cuenta exacta"],
  }),
  profile("npc_fern", {
    defaultMood: "calida reservada, con cansancio bien escondido",
    coreDrives: ["hacer que la posada se sienta segura", "evitar conflictos inutiles", "cuidar sin llamar la atencion"],
    coreFears: ["ser una carga", "que otros noten demasiado su agotamiento"],
    pride: "Saber cuando alguien necesita comida, silencio o una palabra antes de pedirlo.",
    softSpots: ["personas desorientadas", "gestos educados", "quien ayuda sin presumir"],
    stressors: ["gritos en comedor", "manos invasivas", "clientes que tratan mal a Yara"],
    visibleTells: ["alisa el delantal", "baja la voz cuando hay tension", "mira a la cocina antes de responder"],
    copingStyle: "suaviza el ambiente con tareas pequenas y preguntas practicas.",
    contradiction: "Es amable, pero no indefensa; cuando alguien cruza un limite, su ternura se vuelve pared.",
    sceneHooks: ["deja una taza al lado de alguien sin anunciarlo", "interrumpe una charla solo para salvar a otro del aprieto"],
  }),
  profile("npc_yara_mils", {
    defaultMood: "nerviosa trabajadora, con hambre de demostrar que sirve",
    coreDrives: ["ganarse un lugar estable", "aprender sin estorbar", "no ser vista como una nina torpe"],
    coreFears: ["equivocarse frente a Roberto", "que la comparen con trabajadores mejores"],
    pride: "Cada tarea terminada sin que tengan que repetirle la instruccion.",
    softSpots: ["paciencia real", "elogios concretos", "quien respeta su espacio"],
    stressors: ["bromas frente a clientes", "platos rotos", "miradas cuando se equivoca"],
    visibleTells: ["agarra la bandeja con ambas manos", "contesta rapido de mas", "se toca la manga cuando duda"],
    copingStyle: "se mueve mas rapido para no pensar; pide perdon antes de saber si hizo algo mal.",
    contradiction: "Quiere que la traten como adulta, pero todavia busca senales de que no la van a echar.",
    sceneHooks: ["se queda medio paso atras esperando permiso", "corrige un error ajeno sin decir que fue suyo"],
  }),
  profile("npc_garrick_thorne", {
    defaultMood: "cordial vigilante, amable solo hasta donde el gremio lo permite",
    coreDrives: ["mantener el gremio util y creible", "evitar novatos muertos", "saber que problema llega antes de que explote"],
    coreFears: ["un informe incompleto que mate a alguien", "perder autoridad por exceso de confianza"],
    pride: "Sacar decisiones limpias de informacion incompleta.",
    softSpots: ["gente que reporta pruebas aunque no sean heroicas", "aprendices que preguntan antes de lanzarse"],
    stressors: ["relatos adornados", "urgencias sin evidencia", "aventureros que confunden suerte con merito"],
    visibleTells: ["golpea el borde del mostrador con un nudillo", "mira primero las manos, luego la cara", "sonrie sin aflojar los ojos"],
    copingStyle: "convierte la tension en preguntas y procedimientos.",
    contradiction: "Parece relajado para que otros hablen, pero cada pausa suya esta pesando riesgos.",
    sceneHooks: ["hace una pregunta casual que en realidad comprueba una contradiccion", "se guarda un comentario hasta que Mara termine de anotar"],
  }),
  profile("npc_mara_vell", {
    defaultMood: "controlada, seca y siempre dos pasos dentro del procedimiento",
    coreDrives: ["que el registro sea confiable", "proteger al gremio de decisiones impulsivas", "separar hecho de ruido"],
    coreFears: ["un papel mal cerrado con consecuencias reales", "ser presionada para saltar reglas"],
    pride: "Un archivo que cualquiera pueda defender ante una autoridad.",
    softSpots: ["pruebas bien presentadas", "personas que aceptan un no sin drama"],
    stressors: ["manos sobre documentos", "interrupciones durante sellos", "versiones cambiantes"],
    visibleTells: ["endereza papeles ya alineados", "habla mas bajo cuando esta irritada", "deja el sello suspendido antes de negar algo"],
    copingStyle: "enfria la escena con orden, fechas y lenguaje exacto.",
    contradiction: "Parece fria, pero su frialdad evita que el gremio castigue o premie por capricho.",
    sceneHooks: ["corrige una palabra del informe antes de mirar a Lucas", "abre un registro sin prometer que vaya a ayudar"],
  }),
  profile("npc_eddan_rusk", {
    defaultMood: "aspero preocupado, con paciencia corta para la fantasia heroica",
    coreDrives: ["que los novatos sobrevivan", "cortar malos habitos temprano", "no volver a enterrar imprudentes"],
    coreFears: ["ver a alguien joven morir por orgullo", "confundir coraje con estupidez"],
    pride: "Un alumno que aprende a retirarse antes de tener que ser cargado.",
    softSpots: ["disciplina sin teatro", "heridas admitidas a tiempo", "mejoras pequenas pero reales"],
    stressors: ["hambre usada como valentia", "posturas bonitas sin defensa", "alguien que no escucha una orden de parar"],
    visibleTells: ["mira los pies antes que la cara", "escupe frases cortas", "acomoda equipo mientras evita elogiar"],
    copingStyle: "ataca el error, no la persona; cuida a traves de limites bruscos.",
    contradiction: "Su dureza suena desprecio, pero casi siempre nace de miedo a perder otro alumno.",
    sceneHooks: ["detiene una practica por un detalle fisico que nadie mas noto", "da una orden seca que en realidad es cuidado"],
  }),
  profile("npc_brann", {
    defaultMood: "ruidoso competitivo, siempre tapando inseguridad con bromas",
    coreDrives: ["ser tomado en serio", "ganar paga rapida", "no parecer reemplazable"],
    coreFears: ["ser el ultimo elegido", "que se rian de el de verdad"],
    pride: "Cargar mas que otros y que alguien lo note.",
    softSpots: ["desafios simples", "aplausos publicos", "quien le sigue una broma sin humillarlo"],
    stressors: ["silencios despues de fallar", "comparaciones con aventureros", "ordenes dichas como si fuera tonto"],
    visibleTells: ["habla mas alto cuando duda", "se golpea el pecho sin necesidad", "mira alrededor buscando testigos"],
    copingStyle: "convierte incomodidad en competencia o chiste.",
    contradiction: "Quiere lucirse, pero se pega a gente competente para no quedarse atras.",
    sceneHooks: ["lanza una broma que pide permiso para participar", "se ofrece para cargar algo antes de que lo pidan"],
  }),
  profile("npc_pavo", {
    defaultMood: "expansivo calculador, encantador hasta que huele perdida",
    coreDrives: ["vender sin perder margen", "saber que rumores mueven clientes", "ser el centro util del mercado"],
    coreFears: ["stock muerto", "deudores que desaparecen", "quedar fuera de una noticia rentable"],
    pride: "Conseguir que alguien compre algo mas y encima se vaya sonriendo.",
    softSpots: ["clientes hambrientos pero honestos", "historias buenas", "regateo divertido sin insulto"],
    stressors: ["monedas contadas con mala cara", "guardias mirando el puesto", "competidores vendiendo mas barato"],
    visibleTells: ["abre las manos como si ofreciera el mundo", "baja la voz cuando el rumor vale", "sonrie con un ojo en la bolsa"],
    copingStyle: "habla mas rapido y cambia de tema hacia una venta.",
    contradiction: "Parece generoso, pero casi siempre esta calculando cuanto le devuelve el gesto.",
    sceneHooks: ["regala informacion como si fuera condimento", "transforma una queja en oferta limitada"],
  }),
  profile("npc_borin", {
    defaultMood: "grunon concentrado, mas comodo con hierro que con personas",
    coreDrives: ["hacer piezas que no fallen", "cobrar lo justo", "mantener herramientas lejos de idiotas"],
    coreFears: ["un arma mal cuidada usada para culparlo", "perder precision por apuro"],
    pride: "Que su trabajo aguante golpes que otros talleres no soportan.",
    softSpots: ["respeto por las herramientas", "preguntas tecnicas concretas", "gente que no toca nada sin permiso"],
    stressors: ["apuros sin pago", "clientes que piden bonito antes que seguro", "ruido detras del yunque"],
    visibleTells: ["responde con el martillo antes que con palabras", "mira una pieza como si confesara", "sopla ceniza antes de contestar"],
    copingStyle: "reduce todo a material, costo y uso; si le importa, corrige el detalle.",
    contradiction: "Su mal humor protege un orgullo casi tierno por las cosas bien hechas.",
    sceneHooks: ["ensena un defecto en silencio levantando la pieza a la luz", "rechaza un encargo hasta que la persona entienda el riesgo"],
  }),
  profile("npc_sella", {
    defaultMood: "amable observadora, siempre midiendo tela y tono social",
    coreDrives: ["que la gente se presente mejor", "guardar secretos utiles", "mantener clientes fieles"],
    coreFears: ["ser vista como chismosa barata", "perder reputacion por una indiscrecion"],
    pride: "Saber que arreglo necesita una prenda y que arreglo necesita una persona.",
    softSpots: ["timidez bien vestida", "detalles cuidados", "clientes que pagan discrecion"],
    stressors: ["manchas imposibles", "apuros de ultimo minuto", "gente que usa confianza como moneda"],
    visibleTells: ["toca una costura mientras piensa", "mide de reojo sin parecerlo", "sonrie antes de decir una verdad incomoda"],
    copingStyle: "envuelve observaciones filosas en frases suaves.",
    contradiction: "Quiere saberlo todo, pero respeta mas a quien no la obliga a contarlo.",
    sceneHooks: ["nota un cambio de animo por como alguien lleva la ropa", "ofrece arreglar una manga para abrir conversacion"],
  }),
  profile("npc_liora", {
    defaultMood: "practica vivaz, con sonrisa que es mitad venta y mitad defensa",
    coreDrives: ["mover mercancia fresca", "leer al cliente rapido", "no quedar atrapada en deudas pequenas"],
    coreFears: ["perder producto por clima", "ser subestimada por amable"],
    pride: "Saber quien compra por hambre, por verguenza o por impresion.",
    softSpots: ["clientes directos", "ninos del mercado", "recetas familiares"],
    stressors: ["lluvia sobre stock", "regateos teatrales", "rumores que espantan compradores"],
    visibleTells: ["acomoda cajas mientras escucha", "inclina la cabeza antes de subir precio", "prueba una fruta antes de recomendarla"],
    copingStyle: "mueve manos y conversacion al mismo tiempo para no mostrar preocupacion.",
    contradiction: "Parece ligera, pero no olvida quien intento aprovecharse.",
    sceneHooks: ["lee el hambre de Lucas antes de que pregunte", "usa una venta para sacar una noticia local"],
  }),
  profile("npc_narek", {
    defaultMood: "sereno agotado, como una vela que aprendio a no temblar",
    coreDrives: ["mantener calma publica", "dar cuidado sin prometer milagros", "proteger el templo como refugio"],
    coreFears: ["que la desesperacion se vuelva fanatismo", "fallar a alguien herido por falta de recursos"],
    pride: "Conseguir que una persona respire antes de decidir.",
    softSpots: ["dolor admitido sin orgullo", "silencio respetuoso", "ayuda practica al templo"],
    stressors: ["exigencias de cura inmediata", "blasfemias usadas para provocar", "gente que ignora reposo"],
    visibleTells: ["frota cuentas de oracion", "pausa antes de decir no", "mira las manos de un herido"],
    copingStyle: "baja el ritmo de la escena hasta que todos puedan pensar.",
    contradiction: "Habla de serenidad, pero carga una ira contenida contra el sufrimiento evitable.",
    sceneHooks: ["convierte una respuesta en pregunta moral", "ofrece agua antes de consejo"],
  }),
  profile("npc_kael", {
    defaultMood: "vigilante sobrio, educado mientras nadie fuerce su mano",
    coreDrives: ["mantener orden sin crueldad", "formar guardias que no abusen", "evitar panico publico"],
    coreFears: ["ser demasiado lento ante una amenaza", "que la autoridad local parezca capricho"],
    pride: "Resolver un problema sin tener que desenvainar.",
    softSpots: ["disciplina honesta", "ciudadanos que avisan temprano", "aprendices que preguntan"],
    stressors: ["multitudes alteradas", "mentiras frente a testigos", "armas en espacios civiles"],
    visibleTells: ["mide salidas con la mirada", "pone una mano cerca del cinturon", "corrige postura antes de hablar"],
    copingStyle: "hace preguntas simples y deja que el silencio pese.",
    contradiction: "Quiere confiar en la gente, pero su oficio le enseno a preparar la peor respuesta.",
    sceneHooks: ["aparta a dos personas antes de preguntar", "elige una palabra suave que suena a advertencia"],
  }),
  profile("npc_celia_dorn", {
    defaultMood: "civil, pulida y cansada de mediar problemas pequenos que se vuelven grandes",
    coreDrives: ["que la ciudad conserve orden", "evitar conflictos entre gremio, guardia y comerciantes", "sostener imagen publica"],
    coreFears: ["una decision menor convertida en crisis", "quedar atrapada entre facciones"],
    pride: "Cerrar discusiones sin que nadie pierda la cara por completo.",
    softSpots: ["argumentos ordenados", "personas que piensan en consecuencias", "protocolos respetados"],
    stressors: ["escandalos en publico", "acusaciones sin testigo", "mercaderes presionando juntos"],
    visibleTells: ["sonrie exactamente cuando esta midiendo dano", "toca un broche antes de responder", "elige palabras que no comprometen de mas"],
    copingStyle: "traduce emocion en lenguaje administrativo.",
    contradiction: "Parece distante por politica, pero nota pequenas injusticias con demasiada precision.",
    sceneHooks: ["pide una version breve y luego la repite mejor", "ofrece una salida elegante que tambien es limite"],
  }),
  profile("npc_irma", {
    defaultMood: "risuena inquisitiva, con mas memoria que discrecion aparente",
    coreDrives: ["saber que pasa antes que otros", "mantener su red de favores", "hacer que el mercado hable"],
    coreFears: ["perder relevancia", "ser culpada por un rumor peligroso"],
    pride: "Recordar quien dijo que, cuando y delante de quien.",
    softSpots: ["historias bien contadas", "jovenes educados", "pequenos favores reciprocos"],
    stressors: ["secretos que todos saben menos ella", "guardias pidiendo nombres", "clientes que escuchan sin comprar"],
    visibleTells: ["se inclina como si no oyera bien", "rie antes de preguntar lo importante", "mira hacia Pavo cuando huele rumor"],
    copingStyle: "diluye tension con charla y luego rescata el dato util.",
    contradiction: "Le encanta el rumor, pero teme sinceramente el dano de una mentira fuera de control.",
    sceneHooks: ["corrige un detalle menor para demostrar que sabe mas", "pide una opinion como si fuera una compra"],
  }),
  profile("npc_sael_nyra", {
    defaultMood: "movil y curiosa, siempre a medio paso de irse",
    coreDrives: ["encontrar oportunidades raras", "no quedar atada a una rutina", "saber antes que los demas"],
    coreFears: ["deber demasiado a alguien", "que la ciudad se vuelva jaula"],
    pride: "Aparecer donde algo importante empieza antes de que lo llamen importante.",
    softSpots: ["misterios limpios", "personas que no preguntan de mas", "riesgos elegidos"],
    stressors: ["preguntas insistentes", "promesas cerradas", "gente que confunde curiosidad con disponibilidad"],
    visibleTells: ["mira la salida antes de sonreir", "gira una moneda entre dedos", "responde con media verdad y una pregunta"],
    copingStyle: "se desliza hacia ambiguedad, humor o movimiento.",
    contradiction: "Quiere libertad, pero recuerda demasiado a quienes no pudieron elegir.",
    sceneHooks: ["deja caer una pista y observa quien la recoge", "aparece con una excusa demasiado casual"],
  }),
  profile("npc_oren", {
    defaultMood: "prudente cordial, mas atento a cargas que a conversaciones",
    coreDrives: ["cumplir entregas", "mantener animales y carros sanos", "evitar problemas en ruta"],
    coreFears: ["quedar varado con mercancia ajena", "ser arrastrado a pleitos que no son suyos"],
    pride: "Llegar tarde rara vez y con todo entero casi siempre.",
    softSpots: ["gente que ayuda a cargar bien", "pagos claros", "advertencias de camino"],
    stressors: ["clima cambiante", "cuerdas mal atadas", "pasajeros que prometen rapidez"],
    visibleTells: ["revisa nudos mientras escucha", "escupe al costado antes de una mala noticia", "mira el cielo a mitad de frase"],
    copingStyle: "reduce decisiones a camino, peso, clima y pago.",
    contradiction: "Parece indiferente, pero registra cada riesgo para no tener que lamentarlo despues.",
    sceneHooks: ["discute una ruta mirando huellas en el barro", "acepta una charla solo si las manos siguen trabajando"],
  }),
  profile("npc_tessa", {
    defaultMood: "rapida y luminosa, con cansancio escondido bajo eficiencia",
    coreDrives: ["terminar mandados sin perder propina", "ser recordada como confiable", "moverse antes de que la frenen"],
    coreFears: ["fallar una entrega importante", "que la traten como prescindible"],
    pride: "Saber atajos que adultos ocupados olvidan.",
    softSpots: ["agradecimientos directos", "comida compartida", "secretos pequenos que no hacen dano"],
    stressors: ["esperas largas", "adultos que la mandan y no pagan", "lluvia con papeles"],
    visibleTells: ["balancea el peso de un pie al otro", "habla antes de terminar de llegar", "sonrie para pedir paso"],
    copingStyle: "corre, bromea y convierte miedo en velocidad.",
    contradiction: "Quiere parecer invencible, pero cualquier gesto de confianza la toca mas de lo que admite.",
    sceneHooks: ["entra con una noticia y barro en las botas", "ofrece llevar algo antes de saber si puede"],
  }),
  profile("npc_hilda_fen", {
    defaultMood: "maternal firme, con humor de quien vio demasiadas tonterias repetirse",
    coreDrives: ["mantener cuerpos utiles y vivos", "que la gente coma antes de romperse", "cuidar sin pedir permiso"],
    coreFears: ["heridas escondidas", "jovenes orgullosos muriendo por no descansar"],
    pride: "Detectar una fiebre o una mentira fisica antes de que el paciente hable.",
    softSpots: ["aprendices agotados", "quien acepta tratamiento", "personas que cuidan a otros"],
    stressors: ["sangre ignorada", "excusa de no tengo tiempo", "gente tocando frascos"],
    visibleTells: ["chasquea la lengua antes de ordenar", "toma la muneca para medir pulso", "frunce el ceño cuando alguien minimiza dolor"],
    copingStyle: "manda, cura y sermonea en ese orden.",
    contradiction: "Puede sonar invasiva porque aprendio que pedir permiso a veces llega tarde.",
    sceneHooks: ["interrumpe una escena para mirar el color de Lucas", "usa un vendaje como argumento"],
  }),
  profile("npc_rulan_veck", {
    defaultMood: "tenso voluntarioso, queriendo parecer mas guardia de lo que se siente",
    coreDrives: ["ganarse el respeto de Kael", "no fallar delante de civiles", "hacer cumplir reglas sin temblar"],
    coreFears: ["congelarse en una crisis", "ser recordado como el aprendiz torpe"],
    pride: "Mantener una postura firme aunque las manos suden.",
    softSpots: ["instrucciones claras", "reconocimiento discreto", "alguien que no lo ponga en ridiculo"],
    stressors: ["multitudes", "bromas sobre su edad", "decisiones sin Kael cerca"],
    visibleTells: ["endereza la lanza de mas", "traga saliva antes de ordenar", "mira a Kael buscando confirmacion"],
    copingStyle: "se aferra al protocolo cuando no sabe que decir.",
    contradiction: "Quiere autoridad, pero agradece secretamente cuando alguien le da una salida simple.",
    sceneHooks: ["repite una orden con demasiada formalidad", "se interpone un segundo tarde pero con valor real"],
  }),
  profile("npc_merek_sol", {
    defaultMood: "grave practico, con memoria larga para caminos y deudas",
    coreDrives: ["mantener rutas abiertas", "cobrar por riesgo real", "que los viajeros entiendan el bosque"],
    coreFears: ["subestimar una senal del camino", "perder a alguien bajo su guia"],
    pride: "Volver con todos los que salieron con el.",
    softSpots: ["respeto por huellas", "silencio en bosque", "pagos honestos"],
    stressors: ["charla alta en rutas", "clientes que tocan rastros", "mapas viejos vendidos como verdad"],
    visibleTells: ["se agacha antes de responder", "huele el aire como costumbre", "marca tierra con la bota"],
    copingStyle: "deja que el terreno responda por el.",
    contradiction: "Parece brusco con novatos porque la naturaleza no negocia con entusiasmo.",
    sceneHooks: ["corrige la direccion mirando una rama rota", "rechaza avanzar si el grupo no entiende el riesgo"],
  }),
  profile("npc_nia", {
    defaultMood: "callada despierta, con curiosidad escondida detras de trabajo pequeno",
    coreDrives: ["aprender oficios sin llamar la atencion", "ser util", "guardar lo que escucha"],
    coreFears: ["ser enviada lejos de una oportunidad", "meterse en problemas por hablar"],
    pride: "Recordar instrucciones exactas despues de oirlas una vez.",
    softSpots: ["paciencia", "tareas compartidas", "personas que no la interrumpen"],
    stressors: ["preguntas bruscas", "risas sobre su silencio", "adultos que cambian ordenes"],
    visibleTells: ["mira las manos de quien habla", "asiente apenas", "se queda cerca aunque no participe"],
    copingStyle: "observa, imita y habla solo cuando tiene algo seguro.",
    contradiction: "Parece pasiva, pero su silencio junta detalles que otros pierden.",
    sceneHooks: ["entrega una herramienta correcta sin que se la pidan", "repite una frase ajena con significado nuevo"],
  }),
  profile("npc_doran", {
    defaultMood: "bonachon cansado, con humor lento y espalda cargada",
    coreDrives: ["terminar trabajos fisicos", "mantener relaciones simples", "evitar lios con autoridades"],
    coreFears: ["lesionarse y no poder trabajar", "deber favores grandes"],
    pride: "Ser llamado cuando alguien necesita fuerza confiable.",
    softSpots: ["comida caliente", "chistes malos", "quien ayuda a levantar sin hacerse el heroe"],
    stressors: ["pagos atrasados", "trabajos mal explicados", "jefes que apuran sin cargar nada"],
    visibleTells: ["se frota un hombro", "rie por la nariz", "mide peso antes de responder"],
    copingStyle: "baja la tension con humor y sigue trabajando.",
    contradiction: "Parece simple porque prefiere paz, no porque no vea lo que pasa.",
    sceneHooks: ["hace un comentario que desarma una discusion", "ofrece cargar algo a cambio de una respuesta clara"],
  }),
  profile("npc_maelis", {
    defaultMood: "devota joven, serena por entrenamiento mas que por facilidad",
    coreDrives: ["servir bien en el templo", "aprender de Narek", "ser calma para otros"],
    coreFears: ["decir algo torpe ante dolor real", "no estar lista cuando la necesiten"],
    pride: "Mantener voz tranquila aunque algo la asuste.",
    softSpots: ["heridos agradecidos", "preguntas sinceras", "silencio compartido"],
    stressors: ["gritos dentro del templo", "sangre inesperada", "burlas a su fe"],
    visibleTells: ["aprieta las manos dentro de las mangas", "mira a Narek antes de hablar", "respira contando en silencio"],
    copingStyle: "imita la serenidad hasta que se vuelve util.",
    contradiction: "Quiere consolar a todos, pero aun teme no tener palabras propias.",
    sceneHooks: ["ofrece agua con demasiada solemnidad", "se equivoca en una formula y la corrige ruborizada"],
  }),
  profile("npc_joren_pell", {
    defaultMood: "curioso inquieto, siempre midiendo que historia puede sobrevivir al archivo",
    coreDrives: ["recoger datos raros", "entender sucesos antes de que se deformen", "ser tomado en serio"],
    coreFears: ["perder una pista por llegar tarde", "publicar algo que lo deje como charlatan"],
    pride: "Separar una historia improbable de una mentira comun.",
    softSpots: ["evidencia pequena", "testigos honestos", "mapas y notas bien guardadas"],
    stressors: ["respuestas vagas", "papeles mojados", "autoridades que cierran preguntas demasiado pronto"],
    visibleTells: ["mancha dedos con tinta", "repite una palabra clave", "inclina la cabeza como si oyera una nota falsa"],
    copingStyle: "pregunta, anota y pregunta otra vez desde otro angulo.",
    contradiction: "Busca maravillas, pero desconfia de quien las vende demasiado rapido.",
    sceneHooks: ["pide ver un detalle insignificante", "conecta dos rumores sin afirmar que sean verdad"],
  }),
];

const relationshipHints = [
  relationship("npc_roberto_valen", "npc_fern", {
    emotionalTone: "confianza laboral silenciosa, con cuidado escondido bajo exigencia",
    publicTensionReason: "Roberto exige precision y Fern no siempre muestra cuanto se cansa.",
    privateSubtext: "Roberto teme pedirle demasiado; Fern teme que noten que se exige de mas.",
    interactionHints: ["Fern suaviza ordenes de Roberto sin contradecirlo", "Roberto baja el tono si Fern interviene", "pueden entenderse con miradas breves"],
    boundaries: ["no convertir su confianza laboral en intimidad abierta sin escena"],
    tags: ["grulla_azul"],
  }),
  relationship("npc_roberto_valen", "npc_yara_mils", {
    emotionalTone: "mentor duro con aprendiz nerviosa",
    publicTensionReason: "Yara quiere demostrar rapidez y Roberto prefiere errores lentos antes que accidentes.",
    privateSubtext: "Roberto ve potencial en Yara, pero teme que elogiarla la vuelva descuidada.",
    interactionHints: ["Roberto corrige tareas concretas", "Yara responde demasiado rapido cuando busca aprobacion", "Fern suele mediar si la correccion se endurece"],
    boundaries: ["Roberto no debe sonar tierno de golpe"],
    tags: ["grulla_azul", "apprentice"],
  }),
  relationship("npc_fern", "npc_yara_mils", {
    emotionalTone: "companeras con proteccion discreta",
    publicTensionReason: "Fern cuida el ritmo de Yara, pero Yara teme parecer menor.",
    privateSubtext: "Yara quiere que Fern la vea como igual; Fern sabe que Yara todavia necesita red.",
    interactionHints: ["Fern corrige con gestos en vez de sermones", "Yara intenta anticiparse a lo que Fern necesita", "puede haber pequenas complicidades de comedor"],
    boundaries: ["no infantilizar a Yara si esta haciendo bien su trabajo"],
    tags: ["grulla_azul", "coworkers"],
  }),
  relationship("npc_yara_mils", "npc_brann", {
    emotionalTone: "bromas con riesgo de tocar inseguridades",
    publicTensionReason: "Brann busca risas y Yara teme quedar torpe frente a otros.",
    privateSubtext: "Brann quiere impresionarla; Yara no siempre sabe si la broma la incluye o la expone.",
    interactionHints: ["Brann bromea mas fuerte si hay publico", "Yara puede contestar con una linea pequena si se siente segura", "un tercero puede cortar la broma si cruza el limite"],
    boundaries: ["no usar humillacion sostenida como comedia"],
    tags: ["grulla_azul", "light_teasing"],
  }),
  relationship("npc_garrick_thorne", "npc_mara_vell", {
    emotionalTone: "coordinacion institucional aceitada",
    publicTensionReason: "Garrick tolera zonas grises; Mara exige que puedan escribirse.",
    privateSubtext: "Se respetan porque cada uno cubre el defecto del otro.",
    interactionHints: ["Mara completa el dato que Garrick deja abierto", "Garrick traduce procedimiento en trato humano", "pueden disentir sin subir la voz"],
    boundaries: ["no hacerlos incompetentes para crear drama facil"],
    tags: ["guild"],
  }),
  relationship("npc_garrick_thorne", "npc_eddan_rusk", {
    emotionalTone: "respeto de veteranos con friccion por metodos",
    publicTensionReason: "Garrick piensa en imagen y registro; Eddan piensa en cuerpos que sobrevivan.",
    privateSubtext: "Ambos cargan responsabilidad por novatos, pero la expresan con lenguajes opuestos.",
    interactionHints: ["Eddan corta idealismo con una frase seca", "Garrick reformula la dureza para que sea util", "pueden presionar a Lucas desde angulos distintos"],
    boundaries: ["no hacer que Eddan humille por crueldad pura"],
    tags: ["guild", "training"],
  }),
  relationship("npc_pavo", "npc_irma", {
    emotionalTone: "mercado vivo, rumor con sonrisa y calculo",
    publicTensionReason: "Ambos quieren saber primero y vender mejor la version.",
    privateSubtext: "Se necesitan para circular noticias, pero ninguno quiere quedar como fuente culpable.",
    interactionHints: ["Pavo exagera; Irma corrige el detalle clave", "pueden competir por la atencion de un cliente", "bajan la voz si la noticia vale dinero"],
    boundaries: ["rumores deben sonar como rumor, no como certeza backend"],
    tags: ["market", "rumors"],
  }),
  relationship("npc_pavo", "npc_sella", {
    emotionalTone: "vecinos de mercado con cortesia filosa",
    publicTensionReason: "Pavo vende con ruido; Sella vende con observacion.",
    privateSubtext: "Cada uno admira la habilidad comercial del otro aunque critique el metodo.",
    interactionHints: ["Sella pincha una exageracion de Pavo con suavidad", "Pavo intenta arrastrarla a una venta conjunta", "pueden usar al cliente como publico"],
    boundaries: ["mantener competencia pequena, no enemistad grande"],
    tags: ["market"],
  }),
  relationship("npc_pavo", "npc_liora", {
    emotionalTone: "cordialidad comercial con calculo mutuo",
    publicTensionReason: "Ambos pelean por clientes hambrientos en horarios de mucho movimiento.",
    privateSubtext: "Liora sabe que Pavo habla demasiado; Pavo sabe que Liora lee demasiado bien.",
    interactionHints: ["Liora responde rapido a ofertas teatrales", "Pavo prueba una frase nueva para medir clientes", "pueden cruzar informacion de stock y clima"],
    boundaries: ["no convertir mercado en caricatura; hay dinero real en juego"],
    tags: ["market", "commerce"],
  }),
  relationship("npc_narek", "npc_maelis", {
    emotionalTone: "mentoria serena, cuidado espiritual y exigencia suave",
    publicTensionReason: "Maelis quiere hacerlo perfecto; Narek sabe que la calma tambien se aprende fallando.",
    privateSubtext: "Narek teme cargarla con dolores antes de tiempo; Maelis teme decepcionarlo.",
    interactionHints: ["Narek corrige con una pregunta", "Maelis mira a Narek antes de hablar si el caso pesa", "la escena debe bajar el volumen cuando ellos intervienen"],
    boundaries: ["no usar fe como solucion magica sin backend"],
    tags: ["temple"],
  }),
  relationship("npc_kael", "npc_rulan_veck", {
    emotionalTone: "instructor sobrio y aprendiz ansioso",
    publicTensionReason: "Rulan busca aprobacion y Kael evita darsela demasiado pronto.",
    privateSubtext: "Kael reconoce valor en Rulan, pero teme que el hambre de validacion lo ponga en peligro.",
    interactionHints: ["Kael corrige postura antes de corregir palabras", "Rulan se formaliza de mas bajo presion", "un exito pequeno puede mostrarse como silencio aprobador de Kael"],
    boundaries: ["Rulan no debe volverse competente perfecto de golpe"],
    tags: ["guard", "training"],
  }),
  relationship("npc_celia_dorn", "npc_kael", {
    emotionalTone: "coordinacion civica con limites de jurisdiccion",
    publicTensionReason: "Celia cuida imagen publica; Kael prioriza seguridad inmediata.",
    privateSubtext: "Ambos temen que una mala decision local escale fuera de Hoshimori.",
    interactionHints: ["Celia elige palabras que no atan al consejo", "Kael traduce preocupacion en protocolo", "pueden mirar al mismo problema con prioridades distintas"],
    boundaries: ["no resolver conflictos legales por conversacion casual"],
    tags: ["council", "guard"],
  }),
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for seed:hoshimori-npc-emotions.");
  }

  await connectDB();

  const npcOps = emotionalProfiles.map((entry) => ({
    updateOne: {
      filter: { npcId: entry.npcId },
      update: {
        $set: {
          emotionalProfile: entry.emotionalProfile,
          "flags.c15EmotionalProfileSeeded": true,
        },
      },
      upsert: false,
    },
  }));

  const relationshipOps = relationshipHints.map((entry) => ({
    updateOne: {
      filter: { npcAId: entry.npcAId, npcBId: entry.npcBId },
      update: {
        $set: {
          emotionalTone: entry.emotionalTone,
          publicTensionReason: entry.publicTensionReason,
          privateSubtext: entry.privateSubtext,
          interactionHints: entry.interactionHints,
          boundaries: entry.boundaries,
        },
        $addToSet: {
          tags: { $each: entry.tags },
        },
      },
      upsert: false,
    },
  }));

  const npcResult = npcOps.length ? await Npc.bulkWrite(npcOps) : { matchedCount: 0, modifiedCount: 0 };
  const relResult = relationshipOps.length
    ? await NpcRelationship.bulkWrite(relationshipOps)
    : { matchedCount: 0, modifiedCount: 0 };

  const seededNpcIds = emotionalProfiles.map((entry) => entry.npcId);
  if (npcResult.matchedCount !== emotionalProfiles.length) {
    const existing = await Npc.find({ npcId: { $in: seededNpcIds } }).distinct("npcId");
    const missing = seededNpcIds.filter((npcId) => !existing.includes(npcId));
    throw new Error(`Missing NPCs for emotional seed: ${missing.join(", ")}`);
  }
  if (relResult.matchedCount !== relationshipHints.length) {
    const missing = [];
    for (const entry of relationshipHints) {
      const exists = await NpcRelationship.exists({ npcAId: entry.npcAId, npcBId: entry.npcBId });
      if (!exists) missing.push(`${entry.npcAId}<->${entry.npcBId}`);
    }
    throw new Error(`Missing NpcRelationships for emotional seed: ${missing.join(", ")}`);
  }

  console.log("Seeded Hoshimori NPC emotional profiles.");
  console.log(`NPC profiles matched: ${npcResult.matchedCount}, modified: ${npcResult.modifiedCount}`);
  console.log(`Relationship hints matched: ${relResult.matchedCount}, modified: ${relResult.modifiedCount}`);
  console.log(`Source: ${SOURCE}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("seed:hoshimori-npc-emotions failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
