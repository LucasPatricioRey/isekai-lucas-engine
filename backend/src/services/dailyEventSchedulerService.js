const WorldEvent = require("../models/WorldEvent");
const { buildSocialConsequenceHintEffect } = require("./dailyEventSocialService");
const { buildDailyEventNotice } = require("../utils/worldEventPresentation");

const DAILY_EVENT_TAG = "daily_event";
const DAILY_EVENT_PENDING_CONSEQUENCE_TAG = "consequence_pending";
const DEFAULT_GAME_ID = "isekai_lucas_main";
const DAILY_EVENT_TEMPLATE_COOLDOWN_DAYS = 7;

const BLOCK_ROLLS = [
  { roll: 1, key: "morning", block: "Mañana", startTime: "06:00", endTime: "12:00" },
  { roll: 2, key: "midday", block: "Mediodía", startTime: "12:00", endTime: "14:00" },
  { roll: 3, key: "afternoon", block: "Tarde", startTime: "14:00", endTime: "18:00" },
  { roll: 4, key: "night", block: "Noche", startTime: "18:00", endTime: "00:00" },
];

const MINOR_TEMPLATES = [
  {
    id: "inn_supply_request",
    title: "Pedido menor de suministros en La Grulla Azul",
    type: "social_economy",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_grulla_azul_cocina"],
    affectedNpcIds: ["npc_roberto_valen", "npc_yara_mils"],
    affectedFactionIds: ["faction_hoshimori_innkeepers"],
    cause: "La actividad normal de la posada deja una necesidad menor de coordinación o ayuda.",
    consequence:
      "Si Lucas no se involucra, la posada lo resuelve por su cuenta con una molestia leve, demoras chicas o menos margen de confianza práctica.",
  },
  {
    id: "market_price_argument",
    title: "Discusión menor en el mercado",
    type: "social_market",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market"],
    affectedNpcIds: ["npc_pavo", "npc_irma"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Precios, barro residual o rumores de ruta tensan una conversación cotidiana.",
    consequence:
      "Si se ignora, queda como malestar local menor y puede distorsionar un rumor o encarecer un trato pequeño.",
  },
  {
    id: "guild_board_update",
    title: "Actualización menor en la cartelera del gremio",
    type: "guild_notice",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild"],
    affectedNpcIds: ["npc_mara_vell"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "El gremio reorganiza encargos simples y avisos para Porcelana/Cobre.",
    consequence:
      "Si Lucas no revisa el aviso, puede perder una oportunidad menor o enterarse tarde de una tarea simple.",
  },
  {
    id: "road_minor_report",
    title: "Reporte menor sobre una ruta cercana",
    type: "travel_rumor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_road_to_mill"],
    affectedNpcIds: ["npc_garrick_thorne"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Caminantes y guardias traen una observación breve sobre caminos, barro o rastros.",
    consequence:
      "Si se ignora, el mundo sigue sin daño fuerte, pero rutas o rumores pueden quedar menos claros para Lucas.",
  },
  {
    id: "npc_small_favor",
    title: "Favor pequeño de un vecino de Hoshimori",
    type: "social_favor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_fern", "npc_irma"],
    affectedFactionIds: [],
    cause: "Alguien cercano necesita ayuda sencilla o una respuesta breve durante su rutina.",
    consequence:
      "Si Lucas no ayuda, no hay castigo serio, pero se pierde una escena social o una impresión positiva menor.",
  },
  {
    id: "inn_guest_complaint",
    title: "Queja menor de un cliente en La Grulla Azul",
    type: "inn_service",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_roberto_valen", "npc_fern"],
    affectedFactionIds: ["faction_grulla_azul", "faction_hoshimori_innkeepers"],
    cause: "Un cliente cansado por el viaje se molesta por una demora pequena o una mesa mal preparada.",
    consequence:
      "Si Lucas no se involucra, Roberto o Fern lo resuelven con frialdad, pero Lucas pierde una oportunidad de mostrarse util en sala.",
  },
  {
    id: "kitchen_missing_utensil",
    title: "Utensilio extraviado en cocina",
    type: "inn_kitchen",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_cocina"],
    affectedNpcIds: ["npc_yara_mils", "npc_fern"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "El ritmo de cocina deja una herramienta simple fuera de lugar justo antes de preparar el siguiente servicio.",
    consequence:
      "Si Lucas no ayuda, solo hay una demora pequena y Yara queda mas cargada de trabajo.",
  },
  {
    id: "stable_small_delay",
    title: "Demora pequena en entrada y establo",
    type: "inn_arrivals",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_entrance_stable"],
    affectedNpcIds: ["npc_brann", "npc_tessa"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "Una llegada con barro, equipaje o animal de carga retrasa el orden normal de la posada.",
    consequence:
      "Si se ignora, el asunto se resuelve lento y deja barro o desorden menor cerca de la entrada.",
  },
  {
    id: "bakery_queue_confusion",
    title: "Confusion menor en la cola de la panaderia",
    type: "market_food",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_bakery", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_doran", "npc_nia"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Pedidos simples de pan y recados se mezclan durante una hora de movimiento.",
    consequence:
      "Si Lucas no interviene, no pasa nada grave, pero puede perder una oportunidad social o de informacion local.",
  },
  {
    id: "smithy_small_order",
    title: "Pedido pequeno retrasado en la herreria",
    type: "crafting_errand",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_borin_smithy"],
    affectedNpcIds: ["npc_borin", "npc_nia"],
    affectedFactionIds: [],
    cause: "Una pieza simple, un clavo grande o una reparacion menor queda pendiente entre trabajos de Borin.",
    consequence:
      "Si Lucas no ayuda, el pedido se demora y queda como ruido cotidiano de oficio.",
  },
  {
    id: "herb_delivery_mixup",
    title: "Mezcla menor de hierbas en el puesto de Liora",
    type: "market_herbs",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_liora_stall", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_liora", "npc_maelis"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Etiquetas parecidas o bolsas humedas hacen que una entrega pequena necesite revision.",
    consequence:
      "Si se ignora, Liora lo corrige luego, pero se pierde una ocasion de aprender o ganar trato cordial.",
  },
  {
    id: "temple_candle_shortage",
    title: "Faltan velas simples en el templo",
    type: "temple_errand",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_temple_serene_flame"],
    affectedNpcIds: ["npc_narek", "npc_maelis"],
    affectedFactionIds: [],
    cause: "El uso diario del templo deja una necesidad pequena de reposicion antes del siguiente rezo.",
    consequence:
      "Si se ignora, el templo sigue funcionando, pero la ayuda habria dejado una impresion amable.",
  },
  {
    id: "guard_notice_update",
    title: "Aviso menor de la guardia local",
    type: "guard_notice",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guard_post", "loc_hoshimori_plaza"],
    affectedNpcIds: ["npc_kael", "npc_rulan_veck"],
    affectedFactionIds: ["faction_hoshimori_guard"],
    cause: "La guardia actualiza una instruccion simple sobre caminos, horarios o barro residual.",
    consequence:
      "Si Lucas no lo revisa, puede enterarse tarde de un dato menor de viaje o seguridad.",
  },
  {
    id: "council_record_errand",
    title: "Recado menor de registros del consejo",
    type: "civic_errand",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_council_records", "loc_hoshimori_plaza"],
    affectedNpcIds: ["npc_celia_dorn", "npc_merek_sol"],
    affectedFactionIds: [],
    cause: "Un registro local necesita llegar a otra mesa o ser confirmado por alguien del pueblo.",
    consequence:
      "Si se ignora, el tramite queda para otro, sin castigo fuerte pero con menos fluidez local.",
  },
  {
    id: "mill_grain_note",
    title: "Nota pequena sobre grano del molino",
    type: "mill_notice",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_mill", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_oren", "npc_tessa"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Oren necesita confirmar una cantidad menor de grano o avisar una demora sencilla.",
    consequence:
      "Si Lucas no se involucra, la economia local sigue, pero el dato puede llegar mas tarde.",
  },
  {
    id: "market_lost_pouch",
    title: "Bolsa pequena perdida en el mercado",
    type: "market_social",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market"],
    affectedNpcIds: ["npc_irma", "npc_pavo"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Entre compras y regateos, alguien pierde una bolsa pequena o confunde un paquete.",
    consequence:
      "Si se ignora, se resuelve con demora y un poco de mal humor comercial.",
  },
  {
    id: "plaza_message_chain",
    title: "Cadena de mensajes en la plaza",
    type: "town_social",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_plaza"],
    affectedNpcIds: ["npc_nia", "npc_doran"],
    affectedFactionIds: [],
    cause: "Un mensaje cotidiano cambia de manos y puede llegar deformado si nadie lo aclara.",
    consequence:
      "Si Lucas no pregunta, solo queda como rumor blando del pueblo.",
  },
  {
    id: "inn_customer_rumor",
    title: "Rumor de cliente en La Grulla Azul",
    type: "inn_rumor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_joren_pell", "npc_roberto_valen"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "Un viajero o cliente habitual deja caer informacion incompleta entre comida y descanso.",
    consequence:
      "Si se ignora, el rumor queda flotando sin confirmacion y puede perderse el matiz.",
  },
  {
    id: "rain_barrel_check",
    title: "Revisar barriles de agua de la posada",
    type: "inn_maintenance",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_grulla_azul_cocina"],
    affectedNpcIds: ["npc_fern", "npc_yara_mils"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "El clima y el trabajo de cocina obligan a revisar agua limpia, cubos o barriles antes del servicio.",
    consequence:
      "Si Lucas no ayuda, Fern o Yara lo corrigen luego con una molestia menor.",
  },
  {
    id: "guild_training_slot",
    title: "Hueco breve de entrenamiento del gremio",
    type: "guild_training",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild_patio", "loc_hoshimori_guild"],
    affectedNpcIds: ["npc_eddan_rusk", "npc_sael_nyra"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "El patio del gremio queda libre por un rato y alguien ofrece una observacion basica.",
    consequence:
      "Si se ignora, Lucas pierde una oportunidad menor de observar tecnica o disciplina.",
  },
  {
    id: "merchant_sample_offer",
    title: "Muestra pequena entre comerciantes",
    type: "market_offer",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market"],
    affectedNpcIds: ["npc_pavo", "npc_liora"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Los comerciantes comparan calidad, precios o muestras de un producto cotidiano.",
    consequence:
      "Si Lucas no se acerca, no hay perdida directa, pero puede perder informacion de precios.",
  },
  {
    id: "tannery_smell_complaint",
    title: "Queja menor por olor de curtiembre",
    type: "town_complaint",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_tannery", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_hilda_fen", "npc_pavo"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Una corriente de aire lleva olor de trabajo artesanal hacia una zona de paso.",
    consequence:
      "Si se ignora, queda como queja menor y no cambia el mundo de forma importante.",
  },
  {
    id: "road_cart_wheel_noise",
    title: "Rueda ruidosa en la entrada del pueblo",
    type: "travel_minor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_road_entrance", "loc_hoshimori_grulla_azul_entrance_stable"],
    affectedNpcIds: ["npc_brann", "npc_kael"],
    affectedFactionIds: ["faction_hoshimori_guard"],
    cause: "Un carro entra con una rueda floja y crea una molestia practica de poco riesgo.",
    consequence:
      "Si se ignora, el carro avanza lento y deja una pequena demora de ruta.",
  },
  {
    id: "forest_edge_odd_tracks",
    title: "Rastros raros en el borde del bosque",
    type: "travel_rumor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_forest_whispers_edge"],
    affectedNpcIds: ["npc_garrick_thorne", "npc_sael_nyra"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Alguien trae una observacion incompleta sobre huellas, barro o ramas movidas.",
    consequence:
      "Si se ignora, queda como rumor menor y no obliga a viajar.",
  },
  {
    id: "water_bucket_argument",
    title: "Discusion por cubos de agua",
    type: "inn_maintenance",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_cocina", "loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_fern", "npc_yara_mils"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "El trabajo de sala y cocina compite por agua limpia durante unos minutos.",
    consequence:
      "Si Lucas no ayuda, el problema se resuelve, pero con tension practica menor entre tareas.",
  },
  {
    id: "sella_tool_request",
    title: "Sella necesita una herramienta simple",
    type: "crafting_errand",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_sella_workshop", "loc_hoshimori_borin_smithy"],
    affectedNpcIds: ["npc_sella", "npc_borin"],
    affectedFactionIds: [],
    cause: "Un trabajo artesanal requiere una herramienta comun que no esta donde deberia.",
    consequence:
      "Si se ignora, Sella lo resuelve luego y la oportunidad social pasa.",
  },
  {
    id: "liora_herb_label",
    title: "Etiqueta dudosa en hierbas de Liora",
    type: "market_herbs",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_liora_stall"],
    affectedNpcIds: ["npc_liora", "npc_maelis"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Una etiqueta mojada o escrita rapido necesita confirmacion antes de venderse.",
    consequence:
      "Si Lucas no pregunta, Liora evita venderla hasta corregirla sin mayor dano.",
  },
  {
    id: "borin_coal_count",
    title: "Cuenta corta de carbon en la herreria",
    type: "crafting_supply",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_borin_smithy"],
    affectedNpcIds: ["npc_borin", "npc_narek"],
    affectedFactionIds: [],
    cause: "Borin revisa combustible simple y duda si el recuento del dia esta bien.",
    consequence:
      "Si se ignora, la herreria ajusta el trabajo con margen menor.",
  },
  {
    id: "guild_paperwork_queue",
    title: "Cola breve de papeleo del gremio",
    type: "guild_notice",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_council_records"],
    affectedNpcIds: ["npc_mara_vell", "npc_celia_dorn"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Avisos simples del gremio y registros civiles se cruzan durante la manana.",
    consequence:
      "Si se ignora, Lucas puede perder contexto administrativo menor.",
  },
  {
    id: "inn_linen_shortage",
    title: "Faltan panos limpios en la posada",
    type: "inn_maintenance",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_fern", "npc_roberto_valen"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "El trabajo acumulado de habitaciones y sala deja pocos panos limpios a mano.",
    consequence:
      "Si Lucas no ayuda, se resuelve con demora y menos margen de confianza practica.",
  },
];

const IMPORTANT_TEMPLATES = [
  {
    id: "missing_runner",
    title: "Recadero retrasado sin confirmar",
    type: "urgent_local",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_road_to_mill"],
    affectedNpcIds: ["npc_mara_vell", "npc_garrick_thorne"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Un traslado local no cerró a tiempo y el gremio necesita confirmar que no haya peligro real.",
    consequence:
      "Si Lucas no atiende el asunto, puede escalar a búsqueda formal, pérdida de confianza del gremio o riesgo para un NPC menor.",
  },
  {
    id: "supply_chain_break",
    title: "Problema serio de suministros locales",
    type: "economy_pressure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_roberto_valen", "npc_pavo"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "La economía diaria de Hoshimori depende de rutas cortas, clima y coordinación entre comerciantes.",
    consequence:
      "Si no se interviene, puede haber faltantes temporales, precios peores o tensión real entre posada y mercado.",
  },
  {
    id: "route_threat_report",
    title: "Aviso importante sobre amenaza de ruta",
    type: "route_threat",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_road_to_mill"],
    affectedNpcIds: ["npc_garrick_thorne", "npc_sael_nyra"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Rastros, rumores o demoras sugieren que una ruta cercana necesita atención antes de empeorar.",
    consequence:
      "Si se ignora, puede aumentar el peligro de viaje, bloquear encargos o causar daño a terceros fuera de escena.",
  },
  {
    id: "forest_anomaly",
    title: "Anomalía inquietante del Bosque de los Susurros",
    type: "magic_anomaly",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_forest_whispers_edge"],
    affectedNpcIds: ["npc_fern", "npc_mara_vell"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Los rumores sobre luces y sensaciones raras del bosque se vuelven lo bastante concretos como para exigir cuidado.",
    consequence:
      "Si Lucas no lo atiende, puede crecer el miedo local, perderse información mágica o aparecer una restricción de ruta.",
  },
  {
    id: "guild_priority_call",
    title: "Llamado prioritario del gremio local",
    type: "guild_priority",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_grulla_azul"],
    affectedNpcIds: ["npc_mara_vell", "npc_roberto_valen"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "El gremio necesita a gente disponible para resolver un problema local antes de que cierre el día.",
    consequence:
      "Si Lucas lo ignora, puede perder confianza institucional o quedar marcado como poco fiable para tareas futuras.",
  },
  {
    id: "inn_kitchen_fire_scare",
    title: "Susto serio en la cocina de La Grulla Azul",
    type: "inn_emergency",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_cocina", "loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_roberto_valen", "npc_yara_mils", "npc_fern"],
    affectedFactionIds: ["faction_grulla_azul", "faction_hoshimori_innkeepers"],
    cause: "Un descuido, aceite caliente o lena mal colocada amenaza con interrumpir el servicio.",
    consequence:
      "Si Lucas no atiende el asunto, puede haber dano menor, perdida de confianza laboral o tension fuerte en cocina.",
  },
  {
    id: "guard_missing_patrol",
    title: "Patrulla local retrasada",
    type: "guard_emergency",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guard_post", "loc_hoshimori_road_entrance"],
    affectedNpcIds: ["npc_kael", "npc_rulan_veck"],
    affectedFactionIds: ["faction_hoshimori_guard"],
    cause: "Una patrulla de rutina tarda mas de lo esperado y la guardia necesita confirmar que no sea una amenaza.",
    consequence:
      "Si se ignora, la guardia puede perder margen de respuesta y las rutas cercanas quedan bajo sospecha.",
  },
  {
    id: "market_supply_spoilage",
    title: "Suministros del mercado en riesgo",
    type: "economy_pressure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market", "loc_hoshimori_liora_stall"],
    affectedNpcIds: ["npc_pavo", "npc_irma", "npc_liora"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Humedad, calor o mala coordinacion amenaza con arruinar una tanda de productos utiles.",
    consequence:
      "Si Lucas no ayuda o avisa, puede haber precios peores, menos stock temporal o malestar entre comerciantes.",
  },
  {
    id: "temple_sick_traveler",
    title: "Viajero enfermo llega al templo",
    type: "social_health",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_temple_serene_flame", "loc_hoshimori_liora_stall"],
    affectedNpcIds: ["npc_narek", "npc_maelis", "npc_liora"],
    affectedFactionIds: [],
    cause: "Un viajero debil necesita ayuda sencilla, calma o hierbas antes de que el problema empeore.",
    consequence:
      "Si se ignora, el viajero puede empeorar fuera de escena y bajar la confianza de quienes esperaban ayuda.",
  },
  {
    id: "mill_gear_break",
    title: "Pieza importante del molino se rompe",
    type: "mill_problem",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_mill", "loc_hoshimori_borin_smithy"],
    affectedNpcIds: ["npc_oren", "npc_borin"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Una pieza del molino falla y amenaza con retrasar grano, harina o entregas del dia.",
    consequence:
      "Si no se atiende, puede afectar precios, comida local o pedidos de la posada.",
  },
  {
    id: "guild_novice_injured",
    title: "Novato del gremio herido en practica",
    type: "guild_incident",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild_patio", "loc_hoshimori_guild"],
    affectedNpcIds: ["npc_eddan_rusk", "npc_sael_nyra", "npc_mara_vell"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Una practica de patio sale mal y obliga a ordenar, asistir o registrar el incidente.",
    consequence:
      "Si Lucas no se involucra cuando puede, el gremio lo registra como poco atento ante problemas concretos.",
  },
  {
    id: "forest_magic_surge",
    title: "Pulso inquietante desde el Bosque de los Susurros",
    type: "magic_anomaly",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_forest_whispers_edge", "loc_hoshimori_guild"],
    affectedNpcIds: ["npc_fern", "npc_mara_vell", "npc_sael_nyra"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Sensaciones raras, luces o un silencio demasiado denso llegan desde el borde del bosque.",
    consequence:
      "Si se ignora, puede aumentar miedo local, bloquear informacion magica o empeorar una ruta cercana.",
  },
  {
    id: "road_blocked_cart",
    title: "Carro bloqueando una ruta corta",
    type: "route_block",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_road_entrance", "loc_hoshimori_road_to_mill"],
    affectedNpcIds: ["npc_brann", "npc_tessa", "npc_kael"],
    affectedFactionIds: ["faction_hoshimori_guard", "faction_hoshimori_merchants"],
    cause: "Un carro cargado queda atravesado o atascado y corta el paso normal.",
    consequence:
      "Si no se resuelve, puede retrasar suministros, rutas y trabajo de la posada.",
  },
  {
    id: "council_missing_record",
    title: "Registro importante desaparecido",
    type: "civic_problem",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_council_records", "loc_hoshimori_guild"],
    affectedNpcIds: ["npc_celia_dorn", "npc_merek_sol", "npc_mara_vell"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Un papel necesario para permisos, rutas o encargos no aparece donde deberia.",
    consequence:
      "Si se ignora, puede bloquear una gestion menor del gremio o crear sospechas administrativas.",
  },
  {
    id: "inn_guest_threat",
    title: "Cliente agresivo en La Grulla Azul",
    type: "social_conflict",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul_comedor"],
    affectedNpcIds: ["npc_roberto_valen", "npc_fern"],
    affectedFactionIds: ["faction_grulla_azul"],
    cause: "Un cliente cansado o borracho cruza el limite de trato normal en la sala.",
    consequence:
      "Si Lucas no actua con prudencia o avisa, puede haber tension, miedo o perdida de confianza laboral.",
  },
  {
    id: "merchant_debt_pressure",
    title: "Presion por deuda entre comerciantes",
    type: "market_conflict",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market", "loc_hoshimori_sella_workshop"],
    affectedNpcIds: ["npc_pavo", "npc_irma", "npc_sella"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Una cuenta atrasada o un intercambio mal cerrado tensiona a comerciantes locales.",
    consequence:
      "Si se ignora, puede afectar precios, rumores y confianza con el mercado.",
  },
  {
    id: "well_water_problem",
    title: "Problema serio con agua comun",
    type: "town_infrastructure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_plaza", "loc_hoshimori_temple_serene_flame"],
    affectedNpcIds: ["npc_narek", "npc_celia_dorn", "npc_fern"],
    affectedFactionIds: [],
    cause: "Agua turbia, cubos contaminados o una queja repetida obliga a revisar una fuente comun.",
    consequence:
      "Si no se atiende, puede complicar cocina, templo o salud cotidiana durante el dia.",
  },
  {
    id: "smithy_weapon_delay",
    title: "Retraso en una reparacion de armas",
    type: "crafting_pressure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_borin_smithy", "loc_hoshimori_guard_post"],
    affectedNpcIds: ["npc_borin", "npc_garrick_thorne", "npc_kael"],
    affectedFactionIds: ["faction_hoshimori_guard", "faction_hoshimori_guild"],
    cause: "Una reparacion necesaria para guardia o gremio no llega a tiempo.",
    consequence:
      "Si se ignora, puede bajar preparacion local o atrasar una tarea de seguridad.",
  },
  {
    id: "route_refugee_arrival",
    title: "Llegada tensa de viajeros agotados",
    type: "route_social_pressure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_road_entrance", "loc_hoshimori_grulla_azul"],
    affectedNpcIds: ["npc_garrick_thorne", "npc_roberto_valen", "npc_tessa"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_grulla_azul"],
    cause: "Un pequeno grupo llega con cansancio, miedo o informacion de ruta que necesita orden.",
    consequence:
      "Si Lucas no ayuda cuando puede, la posada y el gremio cargan solos con la situacion.",
  },
  {
    id: "magical_item_rumor",
    title: "Rumor peligroso sobre un objeto magico",
    type: "magic_rumor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_sella_workshop"],
    affectedNpcIds: ["npc_fern", "npc_sella", "npc_mara_vell"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Un rumor sobre un objeto raro empieza a atraer curiosidad imprudente.",
    consequence:
      "Si se ignora, puede generar persecuciones tontas, sospechas o un riesgo magico menor que escale.",
  },
];

function randomInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

function rollDailyEventDice(rng = Math.random) {
  const blockRoll = randomInt(1, 4, rng);
  const importanceRoll = randomInt(1, 10, rng);
  const durationRoll = randomInt(1, 15, rng);

  return {
    blockRoll,
    importanceRoll,
    durationRoll,
    importance: importanceRoll <= 7 ? "minor" : "important",
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function eventGameFilter(gameId = DEFAULT_GAME_ID) {
  if (gameId === DEFAULT_GAME_ID) {
    return {
      $or: [
        { gameId },
        { gameId: { $exists: false } },
        { gameId: "" },
        { gameId: null },
      ],
    };
  }

  return { gameId };
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function sanitizeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getBlockByRoll(blockRoll) {
  return BLOCK_ROLLS.find((entry) => entry.roll === blockRoll) || BLOCK_ROLLS[0];
}

function selectTemplate({ gameId, day, rolls, excludedTemplateIds = [] }) {
  const templates = rolls.importance === "important" ? IMPORTANT_TEMPLATES : MINOR_TEMPLATES;
  const excluded = new Set(excludedTemplateIds);
  const availableTemplates = templates.filter((template) => !excluded.has(template.id));
  const selectableTemplates = availableTemplates.length > 0 ? availableTemplates : templates;
  const seed = `${gameId}:${day}:${rolls.blockRoll}:${rolls.importanceRoll}:${rolls.durationRoll}`;
  return selectableTemplates[hashString(seed) % selectableTemplates.length];
}

function extractDailyEventTemplateId(event = {}) {
  if (event.templateId) return event.templateId;
  const tag = (event.tags || []).find((entry) => String(entry).startsWith("daily_event_template_"));
  return tag ? tag.replace("daily_event_template_", "") : "";
}

async function getExcludedDailyEventTemplateIds({ gameId = DEFAULT_GAME_ID, day, session = null } = {}) {
  const recentStartDay = Math.max(1, Number(day || 1) - DAILY_EVENT_TEMPLATE_COOLDOWN_DAYS);
  const events = await WorldEvent.find({
    ...eventGameFilter(gameId),
    tags: DAILY_EVENT_TAG,
    $or: [
      { status: { $in: ["scheduled", "active"] } },
      { startDay: { $gte: recentStartDay, $lte: Number(day || 1) } },
    ],
  })
    .select("templateId tags status startDay")
    .session(session)
    .lean();

  return unique(events.map(extractDailyEventTemplateId));
}

function getEndDay(startDay, durationDays, block) {
  const baseEndDay = Number(startDay) + Number(durationDays);
  return block.endTime === "00:00" ? baseEndDay + 1 : baseEndDay;
}

function getEventStatusAt(event, day, time) {
  if (["resolved", "expired", "consequences_applied", "cancelled"].includes(event.status)) {
    return event.status;
  }

  const now = toAbsoluteMinutes(day, time);
  const start = toAbsoluteMinutes(event.startDay, event.startTime);
  const end = event.endDay && event.endTime ? toAbsoluteMinutes(event.endDay, event.endTime) : null;

  if (end !== null && now >= end) return "expired";
  if (now >= start) return "active";
  return "scheduled";
}

function shouldEnsureDailyEvent(gameState) {
  if (!gameState?.currentDay || !gameState?.time) return false;
  return timeToMinutes(gameState.time) >= timeToMinutes("06:00");
}

function buildDailyEventPayload({ gameState, rolls, excludedTemplateIds = [] }) {
  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const startDay = gameState.currentDay;
  const block = getBlockByRoll(rolls.blockRoll);
  const template = selectTemplate({ gameId, day: startDay, rolls, excludedTemplateIds });
  const durationDays = rolls.durationRoll;
  const severity = rolls.importance === "important" ? "major" : "minor";
  const endDay = getEndDay(startDay, durationDays, block);
  const endTime = block.endTime;
  const eventId = `event_${sanitizeIdPart(gameId)}_d${startDay}_daily_${template.id}`;
  const status = getEventStatusAt(
    {
      status: "scheduled",
      startDay,
      startTime: block.startTime,
      endDay,
      endTime,
    },
    gameState.currentDay,
    gameState.time
  );

  const payload = {
    eventId,
    gameId,
    title: template.title,
    type: template.type,
    scope: "local",
    status,
    startDay,
    startTime: block.startTime,
    endDay,
    endTime,
    affectedLocationIds: template.affectedLocationIds || [gameState.locationId],
    affectedNpcIds: template.affectedNpcIds || [],
    affectedFactionIds: template.affectedFactionIds || [],
    effects: [
      {
        type: "daily_event_rolls",
        target: "scheduler",
        value: {
          blockRoll: rolls.blockRoll,
          block: block.block,
          startTime: block.startTime,
          importanceRoll: rolls.importanceRoll,
          importance: rolls.importance,
          durationRoll: rolls.durationRoll,
          durationDays,
        },
        reason: "Tiradas del evento diario: bloque, importancia y duracion.",
      },
      {
        type: "consequence_if_ignored",
        target: rolls.importance === "important" ? "major_event" : "minor_event",
        value: {
          level: rolls.importance === "important" ? "major" : "minor",
          summary: template.consequence,
          requiresPlayerResolution: rolls.importance === "important",
        },
        reason:
          rolls.importance === "important"
            ? "Evento importante: debe atenderse o resolver sus consecuencias."
            : "Evento menor: opcional, con consecuencias leves si se ignora.",
      },
    ],
    visibility: template.visibility || "local",
    cause: template.cause,
    severity,
    createdBy: "world_tick",
    tags: unique([
      DAILY_EVENT_TAG,
      `daily_event_day_${startDay}`,
      `daily_event_${rolls.importance}`,
      `daily_event_start_${block.key}`,
      `daily_event_duration_${durationDays}`,
      `daily_event_template_${template.id}`,
      rolls.importance === "important" ? "requires_player_resolution" : "optional_event",
    ]),
    templateId: template.id,
    rolls: {
      ...rolls,
      block: block.block,
      startTime: block.startTime,
      durationDays,
    },
  };

  payload.effects.push(buildSocialConsequenceHintEffect(payload));

  return payload;
}

async function findDailyEventForDay({ gameId = DEFAULT_GAME_ID, day, session = null }) {
  return WorldEvent.findOne({
    ...eventGameFilter(gameId),
    tags: { $all: [DAILY_EVENT_TAG, `daily_event_day_${day}`] },
  })
    .session(session)
    .lean();
}

async function ensureDailyEventForGameState(gameState, { session = null, rng = Math.random, rolls = null } = {}) {
  if (!shouldEnsureDailyEvent(gameState)) {
    return {
      generated: false,
      reason: "daily_event_generation_waits_for_morning",
    };
  }

  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const existing = await findDailyEventForDay({ gameId, day: gameState.currentDay, session });

  if (existing) {
    return {
      generated: false,
      reason: "daily_event_already_exists_for_day",
      event: existing,
    };
  }

  const effectiveRolls = rolls || rollDailyEventDice(rng);
  const excludedTemplateIds = await getExcludedDailyEventTemplateIds({
    gameId,
    day: gameState.currentDay,
    session,
  });
  const payload = buildDailyEventPayload({ gameState, rolls: effectiveRolls, excludedTemplateIds });
  const eventPayload = payload;

  const event = await WorldEvent.findOneAndUpdate(
    { eventId: eventPayload.eventId },
    { $setOnInsert: eventPayload },
    { upsert: true, returnDocument: "after", runValidators: true, session }
  ).lean();

  if (event.status === "active") {
    gameState.activeEventIds = unique([...(gameState.activeEventIds || []), event.eventId]);
  }

  return {
    generated: true,
    event,
    templateId: payload.templateId,
    rolls: payload.rolls,
    notice: buildDailyEventNotice(event),
    excludedTemplateIds,
  };
}

async function getLifecycleCandidates(gameId, session) {
  return WorldEvent.find({
    ...eventGameFilter(gameId),
    status: { $in: ["scheduled", "active"] },
  })
    .session(session)
    .lean();
}

async function advanceDailyEventLifecycle(gameState, { session = null } = {}) {
  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const candidates = await getLifecycleCandidates(gameId, session);
  const activated = [];
  const expired = [];
  const activeEventIds = [];

  for (const event of candidates) {
    const nextStatus = getEventStatusAt(event, gameState.currentDay, gameState.time);

    if (nextStatus === "active") {
      activeEventIds.push(event.eventId);

      if (event.status !== "active") {
        const updated = await WorldEvent.findOneAndUpdate(
          { eventId: event.eventId },
          {
            $set: { status: "active" },
            $addToSet: { tags: "event_started" },
          },
          { returnDocument: "after", runValidators: true, session }
        ).lean();
        activated.push(updated);
      }
    }

    if (nextStatus === "expired") {
      const consequenceTag = event.severity === "major" ? "major_consequence_pending" : "minor_consequence_pending";
      const updated = await WorldEvent.findOneAndUpdate(
        { eventId: event.eventId },
        {
          $set: { status: "expired" },
          $addToSet: {
            tags: {
              $each: ["expired_unresolved", DAILY_EVENT_PENDING_CONSEQUENCE_TAG, consequenceTag],
            },
          },
        },
        { returnDocument: "after", runValidators: true, session }
      ).lean();
      expired.push(updated);
    }
  }

  gameState.activeEventIds = unique(activeEventIds);

  return {
    activated,
    expired,
    activeEventIds: gameState.activeEventIds,
  };
}

async function reconcileDailyEventsForGameState(gameState, options = {}) {
  const before = await advanceDailyEventLifecycle(gameState, options);
  const ensured = await ensureDailyEventForGameState(gameState, options);
  const after = await advanceDailyEventLifecycle(gameState, options);

  const changed =
    before.activated.length > 0 ||
    before.expired.length > 0 ||
    Boolean(ensured.generated) ||
    after.activated.length > 0 ||
    after.expired.length > 0;

  return {
    changed,
    generated: ensured.generated ? ensured : null,
    skippedReason: ensured.generated ? "" : ensured.reason,
    activated: [...before.activated, ...after.activated],
    expired: [...before.expired, ...after.expired],
    activeEventIds: gameState.activeEventIds || [],
  };
}

module.exports = {
  DAILY_EVENT_TAG,
  DAILY_EVENT_TEMPLATE_COOLDOWN_DAYS,
  IMPORTANT_TEMPLATES,
  MINOR_TEMPLATES,
  BLOCK_ROLLS,
  advanceDailyEventLifecycle,
  buildDailyEventPayload,
  ensureDailyEventForGameState,
  eventGameFilter,
  extractDailyEventTemplateId,
  getExcludedDailyEventTemplateIds,
  getEventStatusAt,
  reconcileDailyEventsForGameState,
  rollDailyEventDice,
  shouldEnsureDailyEvent,
  timeToMinutes,
  toAbsoluteMinutes,
};
