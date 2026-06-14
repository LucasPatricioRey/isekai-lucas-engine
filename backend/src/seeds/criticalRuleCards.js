const CRITICAL_RULE_CARDS_VERSION = "C24A critical_rule_cards_v1";

const criticalRuleCards = [
  {
    ruleId: "authority.backend_state",
    domain: "core_authority",
    priority: "critical",
    appliesTo: ["all_actions", "all_scenes", "state_resolution"],
    must: [
      "Use MongoDB/backend as live state authority.",
      "Use rules_engine for resolution rules and world_bible for lore only.",
      "Narrate only after mechanical state is validated or read.",
    ],
    never: [
      "Invent money, EXP, MG, loot, rewards, contracts, active missions, NPC presence, romance, secrets, damage, healing or permissions.",
      "Let style override saved state or backend results.",
    ],
    template: "backend_state > rules_engine > world_bible > chat_intent",
    content:
      "Core authority rule. MongoDB/backend is the live save. rules_engine explains resolution. world_bible defines lore. Chat gives intent. If a result changes state, the backend must validate/save it before narration treats it as true.",
    tags: ["rule_card", "authority", "backend", "state", "no_invention"],
  },
  {
    ruleId: "format.mechanical_changes",
    domain: "output_contract",
    priority: "critical",
    appliesTo: ["changes", "hud", "applyTurn", "completeJobShift", "combat_results"],
    must: [
      "Show persistent numerical changes with before->after and delta when available.",
      "Keep narrative prose before HUD, then Cambios relevantes, Estado actual and Alertas only if needed.",
      "Prefer backend displayLines when they exist.",
    ],
    never: [
      "Hide mechanical changes because narration is more dramatic.",
      "Replace exact mechanical output with vague prose.",
    ],
    template: "Campo: before->after (+delta)",
    content:
      "Output contract for mechanical changes. Any persistent number changed by backend must be visible in Cambios relevantes with before->after and delta when available. If backend returns displayLines, copy them instead of rebuilding the line.",
    tags: ["rule_card", "format", "hud", "mechanical_changes", "displayLines"],
  },
  {
    ruleId: "format.skill_progress",
    domain: "output_contract",
    priority: "critical",
    appliesTo: ["changes.skills", "skillPatch", "magicPractice.skills", "completeJobShift.skills", "combat.skills"],
    must: [
      "Show skill name, phase abbreviation, level, EXP before, EXP requirement, EXP after and effective EXP gained.",
      "Show level-up/fase change when levelUps is not empty.",
      "Use backend displayLines if present.",
    ],
    never: [
      "Show only 'Nivel X -> Nivel Y' when EXP data exists.",
      "Hide leftover EXP after level-up.",
      "Summarize skill progress as '+EXP' without before and after.",
    ],
    template: "[Habilidad] [Fase].[Nivel] [antes]/[req]->[Fase].[Nivel] [despues]/[req] (+[EXP])",
    content:
      "Skill progress format is mandatory. For every changes.skills entry, show phase, level and EXP before/after with effective EXP gained. Example: Resistencia P.N8 75/100->P.N9 19/100 (+44). If no level-up, still show EXP before/after.",
    tags: ["rule_card", "format", "skills", "exp", "level_up", "hud"],
  },
  {
    ruleId: "format.social_changes",
    domain: "output_contract",
    priority: "critical",
    appliesTo: ["changes.npcRelationships", "npcRelationshipPatches", "previewSocialImpact"],
    must: [
      "Copy changes.npcRelationships[].displayLines exactly when present.",
      "Show before->after and delta for trust, familiarity, respect, affection, suspicion, fear, jealousy and socialDebt.",
      "If no numerical change applies, explain +0 with current value when known.",
    ],
    never: [
      "Show only '+1' or '+2' without previous and new values.",
      "Treat memory, romance or reputation as trust unless backend says so.",
    ],
    template: "Confianza: 34->35 (+1)",
    content:
      "Social change display is mandatory. Relationship changes must use backend displayLines with before->after and delta. Social memory does not replace relationship values; institutional reputation and personal trust are different.",
    tags: ["rule_card", "format", "social", "relationships", "displayLines"],
  },
  {
    ruleId: "action.scene_flow",
    domain: "action_selection",
    priority: "critical",
    appliesTo: ["gameplay_turn", "mutation", "preview", "pure_question"],
    must: [
      "Use getCompactContext before normal in-game resolution.",
      "Use previews/details when outcome, cost or legality is uncertain.",
      "Use applyTurn only when state changes; use completeJobShift for full job shifts and combat Action for real advanced combat.",
      "Read compact context again after mutation before final narration.",
    ],
    never: [
      "Mutate state for a pure question, thought, OOC check or preview.",
      "Use full context in normal compact gameplay unless debug/admin is needed.",
    ],
    template: "read -> preview/details -> mutate if needed -> reread -> narrate saved state",
    content:
      "Action flow rule. Pure reads and previews do not mutate. State-changing actions use the proper mutator, then the narrator rereads compact context and narrates the saved result.",
    tags: ["rule_card", "actions", "flow", "applyTurn", "preview"],
  },
  {
    ruleId: "biology.accumulators",
    domain: "biology_time",
    priority: "critical",
    appliesTo: ["timeAdvance", "activityCost", "food", "travel", "training", "job"],
    must: [
      "Apply direct bonuses immediately for food, drink, damage, healing, MP and potions.",
      "Process activity costs/bonuses only when reaching or crossing an exact hour.",
      "Persist between-hour activity as biologicalClock.pendingAccumulations.",
    ],
    never: [
      "Charge or heal activity costs twice.",
      "Treat EventLog text as a replacement for biological accumulators.",
      "Advance time without activityCost or explicit biologicalCostExemptReason.",
    ],
    template: "direct_bonus_now + pending_accumulator_until_hour_close",
    content:
      "Biological clock rule. Food and similar direct effects apply immediately. Activity costs wait for exact hour closure. If a scene ends between exact hours, save pending accumulation in backend state.",
    tags: ["rule_card", "biology", "time", "accumulators", "activityCost"],
  },
  {
    ruleId: "job.contract_meals",
    domain: "jobs_economy",
    priority: "critical",
    appliesTo: ["completeJobShift", "contract_meal", "food_purchase", "job_contract"],
    must: [
      "Contract meals apply only when Lucas explicitly chooses them or consumeIncludedMealIds is sent.",
      "Separate customer purchases from included shift meals.",
      "Expose already consumed or available meals through job/contract state.",
    ],
    never: [
      "Consume included contract meals automatically.",
      "Charge inventory rations for contract meals.",
      "Let NPC dialogue replace the mechanical HUD explanation.",
    ],
    template: "consumeIncludedMealIds controls included meal consumption",
    content:
      "Contract meal rule. Included meals do not apply automatically. If Lucas buys lunch as a customer, charge money/stock. If Lucas uses a contract meal, send consumeIncludedMealIds and show it mechanically.",
    tags: ["rule_card", "jobs", "contract_meals", "food", "economy"],
  },
  {
    ruleId: "magic.unlocks_and_practice",
    domain: "magic",
    priority: "critical",
    appliesTo: ["magicPractice", "magicPatches", "knownSpells", "use_magic", "MagicTechnique"],
    must: [
      "Use knownSpells as the authority for castable spells.",
      "Use magicPractice for allowed practice and MP/EXP effects.",
      "Use magicPatches for formal unlocks of branches, skills, techniques or spells.",
      "Treat locked_template as existing design, not learned spell.",
    ],
    never: [
      "Let theory study alone create an offensive spell unless unlock requirements and patch are valid.",
      "Cast a spell Lucas does not know.",
      "Create visible or combat effects without backend mechanicalEffect or combat resolver.",
    ],
    template: "theory/practice != known spell; unlock requires magicPatch",
    content:
      "Magic rule. Lucas can study theory and practice safe techniques, but knownSpells controls real casting. Locked templates are not learned. Unlocks must be formal patches and combat magic must be resolved by backend/combat.",
    tags: ["rule_card", "magic", "knownSpells", "unlock", "practice"],
  },
  {
    ruleId: "combat.backend_resolves",
    domain: "combat",
    priority: "critical",
    appliesTo: ["combat_action", "combatAdvanced", "damage", "injury", "morale", "loot"],
    must: [
      "Use the combat Action for real advanced combat.",
      "Let backend resolve rolls, damage, fatigue, wounds, morale, retreat and consequences.",
      "Claim loot/evidence only through backend preview/claim results.",
    ],
    never: [
      "Decide hit, damage, wound, morale, retreat success or loot by narration.",
      "Start combat when Lucas only asks, observes or previews.",
      "Restore life through recovery endpoints.",
    ],
    template: "combat narration follows backend result",
    content:
      "Combat rule. The narrator describes backend results. It never invents hit chance, damage, wounds, morale, retreat success, loot or evidence. Treatment stabilizes; recovery tracks rest/care and does not restore life by itself.",
    tags: ["rule_card", "combat", "backend_resolves", "injuries", "loot"],
  },
  {
    ruleId: "commitment.promises",
    domain: "commitments",
    priority: "critical",
    appliesTo: ["commitmentPatches", "promise", "deadline", "npc_statement", "pending_admin"],
    must: [
      "Formalize important promises, estimates, appointments and pending duties with commitmentPatches.",
      "Set responsible speaker/faction, due or nextCheck, conditions and blockerSummary when relevant.",
      "Resolve, reprogram or close due/review/needs_schedule commitments before long skips.",
    ],
    never: [
      "Leave an important promise pending forever without next review or blocker.",
      "Treat an estimate as a guaranteed promise unless wording and context support it.",
      "Apply automatic social punishment just because a time passed; resolve consequences explicitly.",
    ],
    template: "promise/estimate -> commitment with owner, status, due/nextCheck, condition/blocker",
    content:
      "Commitment rule. Important NPC promises and pending procedures need formal tracking. If something cannot be fulfilled, save blockerSummary and nextCheck or close it. Do not keep answering 'still pending' without state.",
    tags: ["rule_card", "commitments", "promises", "npc", "pending"],
  },
  {
    ruleId: "events.evidence_progress",
    domain: "missions_events",
    priority: "critical",
    appliesTo: ["worldEventPatches", "evidencePatches", "missionPatch", "report", "mainEvent"],
    must: [
      "Use evidencePatches for samples, tracks, notes and narrative proof objects.",
      "Use worldEventPatches.progress for partial event progress.",
      "Verify mission proof before completion and payment when proof is required.",
      "Keep at most one active blocking main event.",
    ],
    never: [
      "Turn evidence into sellable inventory unless item catalog supports it.",
      "Resolve an event before the actual conclusion is known.",
      "Pay mission rewards before valid verification/completion.",
    ],
    template: "evidencePatches + worldEventPatches.progress before resolution",
    content:
      "Missions/events/evidence rule. Evidence is formal, not invented loot. Partial reports advance event progress without resolving it. Mission proof must be submitted and verified before payment when required.",
    tags: ["rule_card", "events", "evidence", "missions", "proof"],
  },
  {
    ruleId: "npc.knowledge_boundaries",
    domain: "npc_social",
    priority: "critical",
    appliesTo: ["npcKnowledgeContext", "npcMemoryPatches", "knowledgePatches", "dialogue", "secrets"],
    must: [
      "Let NPCs know only what they saw, were told, can infer publicly, remember, learned by rumor or know by role.",
      "Use knowledgePatches/npcMemoryPatches for new formal knowledge.",
      "Express private pressure as gesture or uncertainty unless Lucas has a diegetic source.",
    ],
    never: [
      "Make NPCs omniscient because backend or narrator knows a fact.",
      "Reveal privateSubtext as certain knowledge to Lucas.",
      "Use world_bible lore as NPC knowledge unless the NPC has a source.",
    ],
    template: "NPC speech = public source + memory + role + rumor + visible inference",
    content:
      "NPC knowledge rule. Backend knowledge is not NPC knowledge. Dialogue must respect what each NPC can know. Hidden pressures may guide gestures/subtext, but not become explicit facts Lucas knows.",
    tags: ["rule_card", "npc", "knowledge", "memory", "dialogue"],
  },
  {
    ruleId: "narration.dialogue_hud_boundary",
    domain: "narration",
    priority: "high",
    appliesTo: ["dialogue", "hud", "dramaticContext", "dialogueDirector"],
    must: [
      "Let NPCs react first to Lucas' emotional tone, then to the practical fact.",
      "Use dialogueDirector, emotionalProfile and relationshipDynamics when present.",
      "Put exact mechanical data in Cambios/HUD instead of making NPCs recite systems.",
    ],
    never: [
      "Make dialogue sound like a form or manual.",
      "Drop HUD or mechanical changes because the prose is more dramatic.",
      "Make all NPCs share the same neutral voice.",
    ],
    template: "human dialogue first; exact mechanics in HUD",
    content:
      "Narration boundary rule. Dialogue should be alive, contextual and character-specific, while exact costs, stock, EXP, contract meals, mission rewards and system consequences belong in Cambios relevantes/HUD.",
    tags: ["rule_card", "narration", "dialogue", "hud", "npc_voice"],
  },
];

module.exports = {
  CRITICAL_RULE_CARDS_VERSION,
  criticalRuleCards,
};
