# Isekai Lucas - Combat System Spec

Version: C7 hardening draft
Status: implementation exists through C6; current phase hardens balance, tests and GPT Action contract
Scope: advanced combat architecture, backend resolution, post-combat consequences and treatment

---

## 1. Goal

Build a combat system that is dangerous, auditable, tactical, narratively readable and consistent with the existing engine.

The combat system must not be a loose narrative layer on top of `applyTurn`. Real combat must live in formal combat state, be resolved by backend rules, and persist consequences into the live save only through validated services.

The narrator interprets player intent and writes the scene. The backend decides hit, miss, damage, injury, morale, fatigue, loot eligibility and persistent consequences.

---

## 2. Current Baseline

The current backend already has a simple combat foundation:

- `CombatEncounter`
- `EnemyTemplate`
- `combatService`
- `combatActionService`
- read endpoints for enemies/actions/encounters
- preview endpoint for a combat action
- admin-write style direct round mutator
- automatic checkpoint before combat start/round

Current limitations:

- one enemy shape, not a general participant model
- no `previewId`
- no combatant state model
- no formal distance map
- no action economy
- no seconds-based combat clock
- no backend dice/result resolver
- no persistent injury model separate from GameState injury list
- no weapon profiles
- no formal loot/evidence pipeline
- no combat-specific Action schema

The advanced system should evolve the current base instead of deleting it blindly. Existing endpoints can remain for backwards compatibility or be deprecated once the third combat Action is stable.

---

## 3. Design Principles

### 3.1 Backend Authority

Combat resolution belongs to the backend.

The GPT must not decide:

- whether an attack hits
- exact damage
- critical hit
- enemy death
- morale break
- injury creation
- loot existence
- EXP gain
- mission reward

The GPT may decide:

- Lucas intent
- how to describe confirmed backend results
- whether to ask for clarification when intent is ambiguous
- how NPCs speak based on known state

### 3.2 No Combat Without Encounter

If there is no formal `CombatEncounter`, there is no real combat.

The narrator may describe tension, threat, tracks, intimidation or danger. But attacks, damage, injuries, enemy HP changes, loot and victory require a combat encounter or another validated mutator.

### 3.3 Preview Then Apply

Any dangerous action must have preview/apply separation.

Flow:

1. `combatPreviewAction`
2. backend returns `previewId`
3. `combatApplyAction(previewId)`
4. backend validates state is unchanged
5. backend applies result transactionally

The preview is not just a suggestion. It is a signed/validated intent snapshot.

### 3.4 Consequences Persist

Combat can change:

- HP
- MP
- combat fatigue
- normal energy after conversion
- injuries
- conditions
- inventory
- equipment condition
- evidence
- world event progress
- mission proof/report state
- faction reputation/institutional credit
- NPC relationships if witnesses or allies are involved
- commitments
- location danger/status

Those changes must be formal, not just EventLog text.

### 3.5 Combat Is Not Always To Death

Enemies have motives. A wolf, bandit, starving beast, guard, monster and mindless anomaly should not behave the same.

Possible end states include:

- Lucas wins
- Lucas loses
- Lucas escapes
- enemy flees
- enemy surrenders
- Lucas surrenders
- allies interrupt
- environment interrupts
- combat de-escalates
- combat becomes pursuit
- combat becomes negotiation

### 3.6 No Automatic Loot

Killing or defeating an enemy does not automatically grant loot.

Loot or evidence exists only if:

- the enemy/template supports it
- the scene permits collection
- Lucas has time and safety
- the item/evidence is formalized
- property/witness/danger constraints allow it

---

## 4. Third Action Recommendation

Create a third OpenAPI schema dedicated to combat.

Suggested file:

`backend/docs/openapi-gpt-action-combat.json`

Suggested GPT Action title:

`Isekai Lucas Engine Combat Actions`

Suggested role marker:

`x-action-role: combat-advanced`

Reason:

- compact gameplay schema is already at 30/30 operations
- combat needs multiple read/preview/mutator endpoints
- combat should not crowd normal gameplay Actions
- combat can be audited independently

The third Action can use the same Render service:

`https://isekai-lucas-engine.onrender.com`

Use operation IDs with `combatAdvanced` prefix to avoid duplicate GPT operation names.

---

## 5. Initial Combat Action Operations

Keep the first combat Action under 20 operations.

Recommended initial endpoints:

1. `combatAdvancedPreviewStartEncounter`
2. `combatAdvancedStartEncounter`
3. `combatAdvancedGetEncounter`
4. `combatAdvancedListActiveEncounters`
5. `combatAdvancedListAvailableActions`
6. `combatAdvancedPreviewAction`
7. `combatAdvancedApplyAction`
8. `combatAdvancedResolveNextNpcTurn`
9. `combatAdvancedPreviewEndEncounter`
10. `combatAdvancedEndEncounter`
11. `combatAdvancedPreviewLoot`
12. `combatAdvancedClaimLoot`
13. `combatAdvancedPreviewTreatment`
14. `combatAdvancedApplyTreatment`
15. `combatAdvancedListEnemyTemplates`
16. `combatAdvancedGetEnemyTemplate`
17. `combatAdvancedListWeaponProfiles`
18. `combatAdvancedGetWeaponProfile`
19. `combatAdvancedAuditEncounter`

Do not create separate endpoints for flee/surrender/protect/intimidate at first. They should be action types handled by `previewAction/applyAction`.

---

## 6. Core Flow

### 6.1 Starting Combat

Recommended flow:

1. Player intent creates danger:
   - Lucas attacks
   - enemy attacks
   - failed stealth
   - ambush
   - mission encounter
   - event encounter

2. GPT reads context:
   - `getCompactContext`
   - active events
   - location
   - weather
   - route/danger
   - Lucas status

3. GPT calls:
   - `combatAdvancedPreviewStartEncounter`

4. Backend returns:
   - whether combat can start
   - enemy candidates
   - danger estimate
   - surprise/ambush state
   - terrain/weather/visibility
   - required confirmation if irreversible

5. GPT calls:
   - `combatAdvancedStartEncounter`

6. Backend:
   - creates checkpoint
   - creates encounter
   - creates participants
   - sets distance/position
   - records start log

### 6.2 Player Combat Turn

1. GPT calls `combatAdvancedGetEncounter`
2. GPT calls `combatAdvancedListAvailableActions`
3. Player declares intent
4. GPT maps intent to action:
   - `attack`
   - `defend`
   - `dodge`
   - `observe`
   - `move`
   - `flee`
   - `surrender`
   - `use_item`
   - `use_magic`
   - `protect`
   - `intimidate`
   - `prepare`
   - `grapple`
   - `shove`
   - `disarm`
   - `hide`
5. GPT calls `combatAdvancedPreviewAction`
6. Backend returns `previewId`
7. GPT calls `combatAdvancedApplyAction`
8. Backend resolves and persists
9. GPT narrates exact backend result

### 6.3 NPC Turn

NPC/enemy turns are backend-driven.

Flow:

1. GPT calls `combatAdvancedResolveNextNpcTurn`
2. Backend chooses action from enemy behavior profile
3. Backend resolves rolls/damage/morale
4. GPT narrates confirmed result

For simple 1v1, `combatApplyAction` may optionally resolve the enemy response immediately if encounter phase is set to `exchange`. For richer combat, keep player and NPC turns separate.

### 6.4 Ending Combat

Combat can end when:

- one side cannot act
- one side escapes
- one side surrenders
- enemy morale breaks
- negotiation succeeds
- external interruption
- objective completed
- encounter is cancelled by admin/debug correction

Flow:

1. `combatAdvancedPreviewEndEncounter`
2. `combatAdvancedEndEncounter`
3. apply clock/fatigue conversion
4. finalize injuries
5. mark loot/evidence availability
6. update event/mission progress if applicable
7. create checkpoint

---

## 7. Data Model Overview

### 7.1 CombatEncounter

Purpose: top-level combat state.

Fields:

```js
{
  encounterId,
  gameId,
  status, // active, won, lost, escaped, enemy_fled, surrendered, deescalated, interrupted, cancelled
  phase, // setup, player_turn, npc_turn, reaction_window, round_end, ending
  locationId,
  parentLocationId,
  regionId,
  sourceEventId,
  sourceMissionId,
  sourceCommitmentId,
  startedDay,
  startedTime,
  endedDay,
  endedTime,
  round,
  elapsedSeconds,
  roundDurationSeconds,
  pendingClockAdvanceSeconds,
  terrainTags,
  weatherId,
  weatherCondition,
  visibility,
  noiseLevel,
  surpriseState,
  escapeRoutes,
  participants,
  turnOrder,
  currentActorId,
  distanceMap,
  lootState,
  evidenceState,
  encounterVersion,
  flags
}
```

Status values:

- `active`
- `won`
- `lost`
- `escaped`
- `enemy_fled`
- `surrendered`
- `deescalated`
- `interrupted`
- `cancelled`

Phase values:

- `setup`
- `player_turn`
- `npc_turn`
- `reaction_window`
- `round_end`
- `ending`

### 7.2 CombatantState

Purpose: normalized state for every participant.

Can be embedded in encounter for C2 or separate model for C3+. If separated:

`CombatantState` collection.

Fields:

```js
{
  combatantId,
  encounterId,
  gameId,
  side, // lucas, ally, enemy, neutral
  characterId,
  npcId,
  enemyInstanceId,
  enemyTemplateId,
  name,
  type, // character, npc, enemy, summoned, environmental
  hp,
  mp,
  combatFatigue,
  breath,
  stress,
  morale,
  stance,
  positionState,
  bodyState,
  awarenessState,
  equippedWeaponIds,
  armorProfileId,
  injuries,
  conditions,
  intent,
  targetPriority,
  isConscious,
  isAlive,
  canAct,
  flags
}
```

### 7.3 CombatActionPreview

Purpose: stable preview/apply safety token.

Fields:

```js
{
  previewId,
  gameId,
  encounterId,
  encounterVersion,
  stateHash,
  round,
  phase,
  actorId,
  actionType,
  targetIds,
  params,
  expectedCosts,
  riskSummary,
  possibleOutcomes,
  deterministicSeed,
  expiresAt,
  status, // pending, applied, expired, invalidated
  createdAt
}
```

Apply rule:

- preview must exist
- preview status must be `pending`
- encounter must still be active
- `encounterVersion` must match
- `stateHash` must match relevant state
- current actor/phase must match
- preview must not be expired

### 7.4 CombatLogEntry

Purpose: audit trail for every resolved action.

Fields:

```js
{
  logId,
  encounterId,
  gameId,
  round,
  phase,
  actorId,
  actorName,
  actionType,
  targetIds,
  previewId,
  rolls,
  modifiers,
  result,
  damage,
  injuriesCreated,
  positionChanges,
  moraleChanges,
  fatigueChanges,
  resourceChanges,
  lootChanges,
  evidenceChanges,
  missionChanges,
  eventChanges,
  narrativeSummary,
  visibility,
  createdDay,
  createdTime,
  elapsedSeconds
}
```

Rolls should be visible in technical/debug mode and hidden/summarized in normal narration.

### 7.5 InjuryRecord

Purpose: persistent wound model.

Fields:

```js
{
  injuryId,
  gameId,
  encounterId,
  targetType,
  targetId,
  bodyPart,
  injuryType,
  severity,
  bleeding,
  pain,
  mobilityPenalty,
  actionPenalty,
  concentrationPenalty,
  untreatedRisk,
  requiresTreatment,
  treated,
  treatmentQuality,
  createdDay,
  createdTime,
  createdByActionId,
  expectedRecoveryDays,
  status, // active, treated, healing, healed, worsened, permanent
  notes
}
```

Body parts initial set:

- `head`
- `torso`
- `left_arm`
- `right_arm`
- `left_leg`
- `right_leg`
- `hand`
- `foot`

Optional later:

- `neck`
- `face`
- `back`
- `left_hand`
- `right_hand`
- `left_foot`
- `right_foot`

Severity:

- `scratch`
- `minor`
- `moderate`
- `serious`
- `critical`
- `maimed`

Initial implementation should support `maimed` as schema value but avoid generating it except for extreme consequences.

### 7.6 EnemyTemplate

Upgrade current enemy templates.

Fields:

```js
{
  enemyId,
  name,
  species,
  type, // animal, beast, monster, human_hostile, anomaly
  dangerRank,
  rankHint,
  baseStats,
  attacks,
  defenses,
  movement,
  senses,
  moraleProfile,
  behaviorProfile,
  lootProfile,
  evidenceProfile,
  habitatTags,
  signals,
  retreatLogic,
  rewardPolicy,
  flags
}
```

Stats:

```js
{
  hp,
  mp,
  attack,
  defense,
  agility,
  perception,
  endurance,
  morale,
  speed,
  awareness,
  instinct
}
```

### 7.7 WeaponProfile

Purpose: weapon rules independent from Item catalog.

Fields:

```js
{
  weaponProfileId,
  itemId,
  name,
  weaponType,
  rangeBand,
  damageType,
  baseDamage,
  accuracyModifier,
  defenseModifier,
  speedModifier,
  fatigueCostModifier,
  requiredSkillId,
  offhandAllowed,
  traits,
  conditionRules,
  notes
}
```

Weapon types:

- `unarmed`
- `dagger`
- `short_sword`
- `long_sword`
- `spear`
- `staff`
- `club`
- `axe`
- `bow`
- `crossbow`
- `shield`
- `improvised`

Traits:

- `light`
- `heavy`
- `reach`
- `thrown`
- `two_handed`
- `defensive`
- `armor_piercing`
- `nonlethal`
- `improvised`
- `concealable`
- `slow`
- `fast`

### 7.8 CombatLootState

Purpose: prevent automatic loot.

Fields:

```js
{
  status, // none, unavailable, available_unclaimed, partially_claimed, claimed, abandoned, blocked
  reason,
  candidateItems,
  candidateEvidence,
  blockedByDanger,
  blockedByWitnesses,
  blockedByOwnership,
  requiresSearchAction,
  searched,
  claimedByCharacterId,
  claimedDay,
  claimedTime
}
```

### 7.9 CombatTreatmentState

Purpose: treatment preview/apply for post-combat or during combat.

Fields:

```js
{
  treatmentId,
  injuryId,
  actorId,
  targetId,
  itemIds,
  treatmentType,
  difficulty,
  previewId,
  expectedOutcome,
  appliedOutcome,
  status
}
```

---

## 8. Action Economy

Each combat round should understand action economy.

Default round duration:

`6 seconds`

Each combatant per turn:

- `mainAction`
- `moveAction`
- `reaction`
- `freeAction`

### 8.1 Main Action

Examples:

- attack
- use item
- cast magic
- grapple
- shove
- disarm
- intimidate
- observe carefully
- apply emergency treatment

### 8.2 Move Action

Examples:

- change distance
- stand up
- take cover
- move behind ally
- step back
- approach
- disengage carefully

### 8.3 Reaction

Examples:

- dodge
- block
- parry
- counter if prepared
- protect nearby target

Reaction should be consumed for the round.

### 8.4 Free Action

Examples:

- shout short phrase
- drop item
- glance quickly
- signal ally

Free action cannot replace social scenes or long commands.

---

## 9. Distance, Position and Terrain

### 9.1 Distance Bands

Distance values:

- `grappled`
- `engaged`
- `near`
- `short`
- `medium`
- `far`
- `out_of_sight`

Meaning:

- `grappled`: grabbed/wrestling; weapons constrained
- `engaged`: melee range
- `near`: a step or short lunge away
- `short`: close projectile/charge range
- `medium`: meaningful movement needed
- `far`: projectile/escape range
- `out_of_sight`: cannot target directly without perception/reposition

### 9.2 Position States

Position states:

- `standing`
- `prone`
- `cornered`
- `covered`
- `flanked`
- `grappled`
- `restrained`
- `off_balance`
- `hidden`
- `exposed`
- `mounted`
- `climbing`

### 9.3 Terrain Tags

Terrain tags:

- `mud`
- `roots`
- `uneven_ground`
- `darkness`
- `rain`
- `narrow_path`
- `cover`
- `water`
- `slope`
- `indoors`
- `crowd`
- `low_ceiling`
- `poor_visibility`
- `forest`
- `road`
- `stone_floor`
- `wood_floor`

Terrain must affect:

- movement difficulty
- dodge
- footing
- visibility
- noise
- escape
- ranged attacks
- fire/magic risk

---

## 10. Visibility and Knowledge

Combat state has two layers:

1. real state
2. visible state

The GPT should narrate from visible state in normal play.

Visible HP modes:

- `exact`
- `approximate`
- `hidden`

Certainty:

- `confirmed`
- `probable`
- `unclear`

Examples:

- known human opponent: exact or approximate HP may be shown depending rules
- strange monster: visible state should say "cojea", "sangra", "parece inestable"
- hidden enemy: target cannot be attacked directly unless located

Normal combat can still show numbers if rules require, but the engine should support partial information for future monsters/anomalies.

---

## 11. Fatigue and Time

### 11.1 Combat Clock

Do not advance world time by 5 minutes per attack.

Combat uses seconds:

- `roundDurationSeconds: 6`
- `elapsedSeconds`
- `pendingClockAdvanceSeconds`

At combat end:

- convert elapsed seconds to world time if >= 60 seconds
- keep sub-minute remainder if needed
- process biological clock only when world clock crosses exact minute/hour boundaries according to existing biology rules

### 11.2 Combat Fatigue

Combat fatigue is not the same as normal energy.

Fields:

- `combatFatigue`
- `breath`
- `stress`

During combat:

- attacks increase fatigue
- dodges increase fatigue more
- fear/stress affects concentration
- heavy armor/weapons increase fatigue

At combat end:

Example conversion:

- `combatFatigue 0-5`: energy -1
- `6-12`: energy -3
- `13-20`: energy -6
- `21-35`: energy -10
- `36+`: energy -15 or exhaustion condition

These values are initial targets, to be balanced by tests.

---

## 12. Resolution Rules

The backend resolves actions with deterministic random rolls.

Each applied action should store:

- deterministic seed
- attack roll
- defense roll
- damage roll
- injury roll
- morale roll
- modifiers

### 12.1 Attack Formula

Draft:

```txt
attackScore =
  actor.agility
  + relevantWeaponSkill
  + weapon.accuracyModifier
  + perceptionBonus
  + stanceModifier
  + distanceModifier
  + terrainModifier
  + fatigueModifier
  + injuryModifier
  + roll
```

Defense:

```txt
defenseScore =
  target.agility
  + dodgeBlockOrParrySkill
  + shieldOrWeaponDefense
  + armorDefense
  + awarenessModifier
  + distanceModifier
  + terrainModifier
  + fatigueModifier
  + injuryModifier
  + roll
```

Hit margin:

```txt
hitMargin = attackScore - defenseScore
```

### 12.2 Result Bands

Initial bands:

- `<= -8`: bad miss / counter opening
- `-7 to -1`: miss
- `0 to 4`: glancing hit
- `5 to 11`: clean hit
- `12 to 18`: strong hit
- `19+`: critical hit

The exact numbers can be tuned after tests.

### 12.3 Damage Formula

Draft:

```txt
rawDamage =
  weapon.baseDamage
  + statBonus
  + hitMarginDamageBonus
  + criticalBonus
  + roll
```

Reduction:

```txt
finalDamage =
  rawDamage
  - armorReduction
  - naturalDefense
  - resistanceReduction
```

Clamp:

```txt
finalDamage = max(0, finalDamage)
```

### 12.4 Injury Roll

Not every HP loss creates injury.

Injury chance increases with:

- critical hit
- high final damage
- piercing/slashing/crushing weapon
- vulnerable body part
- target already off-balance/prone
- bite/claw
- falling
- bleeding traits

Injury severity depends on:

- final damage
- hit margin
- weapon damage type
- target armor
- body part
- existing injuries

### 12.5 Morale Roll

Morale changes from:

- taking injury
- losing HP
- being outnumbered
- seeing ally fall
- intimidation
- fire/magic
- hunger/territorial drive
- being cornered
- Lucas being visibly weak or strong

Morale results:

- no change
- cautious
- angered
- afraid
- panic
- flee
- surrender if intelligent
- berserk if profile allows

---

## 13. Enemy AI

Enemy AI chooses actions based on profile.

### 13.1 Morale States

- `confident`
- `cautious`
- `angered`
- `afraid`
- `panicked`
- `fleeing`
- `surrendering`
- `cornered`
- `berserk`

### 13.2 Behavior Profiles

- `territorial`
- `hungry`
- `protective`
- `predatory`
- `trained`
- `cowardly`
- `ambusher`
- `opportunist`
- `mindless`
- `guard_duty`
- `desperate`

### 13.3 AI Decision Inputs

Backend should consider:

- current HP
- injuries
- morale
- distance
- enemy motive
- target weakness
- escape route
- terrain
- number advantage
- pain/fear
- previous round result
- source event/mission objective

### 13.4 Examples

Wolf:

- tests weakness
- avoids needless death
- may flee if wounded
- may pursue if prey is exhausted

Starving beast:

- more aggressive
- less willing to retreat
- may disengage if badly hurt

Bandit:

- uses intimidation
- may surrender/flee
- may target money/equipment
- reacts to witnesses

Mindless anomaly:

- no surrender
- low/no morale
- follows strange rules

---

## 14. Action Types

Initial `actionType` enum:

- `attack`
- `defend`
- `dodge`
- `observe`
- `move`
- `flee`
- `surrender`
- `use_item`
- `use_magic`
- `protect`
- `intimidate`
- `prepare`
- `grapple`
- `shove`
- `disarm`
- `hide`
- `ready_reaction`
- `wait`

### 14.1 Attack

Required:

- actor
- target
- weapon or unarmed

Optional:

- aimed body part
- nonlethal
- aggressive/cautious style

### 14.2 Defend

Improves defense until next turn/round.

May use:

- weapon
- shield
- terrain cover
- stance

### 14.3 Dodge

Higher fatigue cost than defend. Needs space and footing.

Bad with:

- mud
- roots
- cornered
- grappled
- low energy

### 14.4 Observe

Reveals:

- enemy intent
- weakness
- injury severity
- escape route
- hidden threat

May improve next action.

### 14.5 Move

Changes distance/position.

May provoke reaction if leaving `engaged` without disengage.

### 14.6 Flee

Mechanically resolved.

Inputs:

- distance
- terrain
- enemy speed
- Lucas energy
- injuries
- visibility
- escape route
- enemy motivation

Outcomes:

- clean escape
- partial escape/pursuit
- fail
- fail with attack of opportunity
- escape but drop item/evidence if severe

### 14.7 Surrender

Only meaningful against intelligent enemies.

Possible outcomes:

- accepted
- ignored
- exploited
- delayed
- enemy demands item/money
- enemy flees instead

### 14.8 Use Item

Must validate:

- item exists
- Lucas has it
- item usable in combat
- action economy permits
- consumes or not

### 14.9 Use Magic

Initial rule:

Lucas has Mana/Magia awakened but no offensive spell mastery. Combat magic should be mostly blocked until a valid technique/spell exists.

Use magic must:

- validate known technique/spell
- validate MP
- validate risk of uncontrolled casting
- never invent spell effects

### 14.10 Protect

Interpose for ally/NPC.

May:

- reduce target risk
- increase Lucas risk
- consume reaction or main action

### 14.11 Intimidate

Targets morale, not HP.

Works better against:

- intelligent enemies
- cowardly enemies
- wounded enemies
- outnumbered enemies

Weak/invalid against:

- mindless
- berserk
- starving beast
- enemy with overwhelming advantage

---

## 15. Skills

Do not activate every possible combat skill at once.

### 15.1 Initial Combat Skills

Add/activate first:

- `skill_daga`
- `skill_esquiva`
- `skill_bloqueo`
- `skill_pelea_sin_armas`
- `skill_rastreo`
- `skill_tactica_basica`

### 15.2 Later Skills

Add later:

- `skill_espada_corta`
- `skill_espada_larga`
- `skill_lanza`
- `skill_arco`
- `skill_escudo`
- `skill_parry`
- `skill_sigilo`
- `skill_supervivencia`

### 15.3 EXP Philosophy

Do not give EXP for killing.

Give EXP for meaningful use:

- attacking with a weapon
- defending correctly
- dodging under pressure
- observing enemy pattern
- tracking
- using terrain
- retreating intelligently
- protecting someone
- surviving injury

EXP should be based on:

- action difficulty
- danger
- novelty
- success quality
- risk
- current skill phase

Low-level combat skills should progress faster than old defaults, consistent with recent skill progression rebalance.

---

## 16. Weapons and Equipment

### 16.1 Initial Weapons

Initial supported weapon profiles:

- unarmed
- dagger
- improvised club/stick
- short blade
- simple shield

### 16.2 Equipment Damage

Do not implement full durability per hit in C2/C3.

Do support:

- major equipment damage from critical events
- dropped weapon
- disarmed weapon
- weapon unusable due to explicit consequence

Full durability can be later.

### 16.3 Armor

Initial armor:

- no armor
- clothing
- padded/light protection
- shield as defensive item

Armor should affect:

- damage reduction
- fatigue
- movement
- coverage

---

## 17. Injuries and Treatment

### 17.1 Injury Effects

Injuries can affect:

- accuracy
- defense
- movement
- dodge
- block
- item use
- concentration
- bleeding over time
- recovery

### 17.2 Bleeding

Bleeding levels:

- `none`
- `minor`
- `moderate`
- `severe`

Bleeding can:

- lower HP over combat rounds
- worsen after movement
- require treatment
- create urgency

### 17.3 Pain

Pain levels:

- `none`
- `mild`
- `moderate`
- `severe`

Pain affects:

- action penalty
- concentration
- morale/stress

### 17.4 Treatment

Treatment can happen:

- during combat, risky
- after combat
- at inn/temple/guild/healer

Treatment actions:

- apply pressure
- bandage
- clean wound
- splint
- rest
- use potion
- request healer

Treatment preview must validate:

- item availability
- time required
- safety
- skill/knowledge if relevant
- severity

---

## 18. Loot, Evidence, Mission and Event Integration

### 18.1 Evidence

Combat can create evidence:

- claw fragment
- blood trace
- fur sample
- broken weapon
- bandit token
- monster residue
- witness statement

Use existing `evidencePatches`.

### 18.2 World Event Progress

Combat can update:

- `worldEventPatches.progress.stage`
- evidence ids
- report ids
- confidence
- next action

Example:

```js
progress: {
  stage: "creature_confirmed",
  confidence: "strong",
  evidenceIds: ["evidence_claw_fragment_d16"],
  nextAction: "Reportar al gremio y pedir identificacion."
}
```

### 18.3 Mission Proof

If combat is tied to mission:

- combat evidence can become proof
- report can submit proof
- verification must happen before reward
- no MG/reward just because enemy died

### 18.4 Institutional Credit

Useful combat reports can modify faction standing:

- `factionReputationPatches.institutionalCreditDelta`
- `meritDelta`
- `reputationDelta`

Do not convert institutional value into personal social debt unless there is direct personal interaction.

---

## 19. Checkpoints and Safety

Automatic checkpoint required:

- before starting real combat
- before first damaging action
- before applying serious/critical injury
- before ending combat with death/loss
- before claiming significant loot
- before irreversible mission/event consequence

Checkpoint metadata should include:

- encounterId
- phase
- round
- actor
- actionType
- previewId
- dangerRank
- affected mission/event ids

---

## 20. GPT Narration Rules

Normal narration must:

- narrate only confirmed backend result
- keep tension sensory and clear
- show numbers in readable way
- avoid inventing enemy death/loot
- avoid overexplaining rolls unless debug mode
- distinguish visible state from hidden state
- mention injuries and position changes

Combat status block should include:

- round
- Lucas HP/MP
- combat fatigue or energy consequence
- injuries/bleeding
- enemy visible state/HP mode
- distance
- position
- available immediate choices

Example:

```md
### Combate
Ronda: 2
Distancia: engaged
Lucas: 92/100 vida, fatiga de combate 7, corte leve en brazo derecho
Lobo: herido leve, moral cautelosa
Posicion: Lucas de pie; lobo expuesto entre raices
```

---

## 21. OpenAPI Combat Schema

Initial schema should not exceed 20 operations.

Security:

- read/preview endpoints can use gameplay key
- mutating endpoints should be non-consequential in GPT metadata only if user wants frictionless play, but backend must still validate hard
- direct debug/admin endpoints should not be exposed in normal combat Action

Important:

- no rollback
- no checkpoint create
- no raw DB repair
- no direct reward grant

### 21.1 Suggested Request Shapes

#### preview action

```json
{
  "gameId": "isekai_lucas_main",
  "actorId": "combatant_lucas",
  "actionType": "attack",
  "targetIds": ["combatant_enemy_1"],
  "params": {
    "weaponItemId": "item_daga_simple",
    "style": "cautious",
    "aimedBodyPart": "torso"
  }
}
```

#### apply action

```json
{
  "gameId": "isekai_lucas_main",
  "previewId": "combat_preview_..."
}
```

### 21.2 Suggested Response Shape

```json
{
  "ok": true,
  "result": {
    "encounterId": "...",
    "round": 1,
    "actionType": "attack",
    "outcome": "glancing_hit",
    "damage": {
      "hp": 3,
      "type": "piercing"
    },
    "injuriesCreated": [],
    "positionChanges": [],
    "moraleChanges": [],
    "fatigueChanges": [],
    "visibleState": {
      "enemy": "El lobo retrocede con un corte superficial."
    },
    "displayLines": []
  }
}
```

---

## 22. Acceptance Tests

### 22.1 Required C2/C3 Tests

1. Cannot start combat if active combat already exists.
2. Starting combat creates checkpoint.
3. Preview action does not mutate state.
4. Apply action without previewId fails.
5. Apply action with expired previewId fails.
6. Apply action with changed encounterVersion fails.
7. Attack result is backend-generated.
8. Defend reduces incoming risk.
9. Dodge costs more fatigue than defend.
10. Flee can succeed/fail based on distance/terrain/enemy speed.
11. Surrender only works against intelligent enemies.
12. Enemy can flee by morale.
13. Injury can be created by critical/high damage.
14. Bleeding persists after combat.
15. Combat fatigue converts to energy at end.
16. Combat clock advances by seconds and converts at end.
17. Loot is not granted automatically.
18. Evidence can be created from combat result.
19. Mission reward is not paid by combat end alone.
20. Active combat appears in compact context.
21. World tick does not silently skip active combat.
22. Checkpoints occur before irreversible outcome.

### 22.2 Playtest Scenarios

Minimum scenarios:

1. Lucas vs weak rat/beast, 1v1.
2. Lucas vs wolf edge encounter, low/medium danger.
3. Lucas tries to flee from wolf.
4. Lucas defends for a round.
5. Lucas observes before attacking.
6. Lucas receives minor injury.
7. Enemy flees from morale break.
8. Lucas reports evidence after combat.
9. Loot preview says none/unavailable.
10. Treatment preview for a minor cut.

---

## 23. Implementation Phases

### Phase C1 - Spec

Deliverable:

- `COMBAT_SYSTEM_SPEC.md`

No code changes except docs.

### Phase C2 - Models

Deliverables:

- upgraded `CombatEncounter`
- `CombatantState`
- `CombatActionPreview`
- `CombatLogEntry`
- `InjuryRecord`
- `WeaponProfile`
- compatibility helpers for current simple combat

No full resolution engine yet.

### Phase C3 - Minimal Endpoints

Deliverables:

- combat third OpenAPI draft
- preview/start
- start
- get/list encounter
- list actions
- preview action
- apply action
- resolve next NPC turn
- end encounter

### Phase C4 - Resolution Engine

Deliverables:

- backend rolls
- hit/defense/damage
- injury roll
- morale roll
- fatigue
- position changes
- visible state summaries

### Phase C5 - Loot, Evidence, Mission Integration

Deliverables:

- preview loot
- claim loot
- evidence creation
- event progress
- mission proof linkage
- faction credit linkage

### Phase C6 - Treatment and Recovery

Deliverables:

- treatment preview/apply
- bleeding handling
- injury recovery state
- healer/temple/inn integration

### Phase C7 - GPT Integration and Audits

Deliverables:

- combat OpenAPI action under 20 ops
- GPT instruction patch under 8000 chars if needed
- compact context combat summaries
- smoke tests
- API hardening tests
- playtest script

---

## 24. Out of Scope for Initial Combat

Do not implement in first combat release:

- large group combat
- full durability per hit
- dismemberment-heavy simulation
- advanced offensive magic
- mounted combat
- siege weapons
- crafting weapons
- complex combo trees
- arena/duel legal system
- mass battlefield AI

These can be future expansions after 1v1/1v2 combat is stable.

---

## 25. Mandatory vs Optional

### Mandatory

- third combat Action
- formal encounter
- previewId/apply validation
- backend rolls
- action economy
- seconds clock
- combat fatigue
- distance map
- position states
- terrain tags
- persistent injuries
- enemy morale
- enemy behavior profile
- flee/surrender as action types
- loot preview/claim separation
- evidence/event/mission integration
- automatic checkpoints
- tests

### Optional Later

- body part expansion
- full armor coverage simulation
- full durability
- multi-party tactics
- ally command system
- stealth combat
- traps
- advanced magic combat
- enemy spellcasting
- combat reputation/public witnesses

---

## 26. Design Decision Summary

Use a third combat Action.

Use generic action endpoints:

- `combatAdvancedPreviewAction`
- `combatAdvancedApplyAction`

Do not create separate endpoints for every action type.

Use `previewId` to prevent stale previews.

Use formal persistent combat state for every real fight.

Keep first implementation focused on:

- 1v1
- 1v2
- fleeing
- defending
- minor/moderate injury
- enemy morale break
- evidence after combat

Only after this works should the project add bigger combat features.
