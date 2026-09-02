'use strict';

/**
 * Twenty Questions engine — server-authoritative.
 *
 * Rules:
 *  - Server picks a random subject from a curated bank (person, animal, country, food, object, occupation).
 *  - Category is revealed as a hint at game start.
 *  - Players ask yes/no questions (free-for-all, 5s cooldown per player).
 *  - 20 shared questions total. "Unsure" answers don't count against the limit.
 *  - Any player can guess at any time (no cooldown on guesses).
 *  - First correct guess wins; if 20 questions pass with no correct guess, nobody wins.
 *
 * Interface:
 *   createGame(playerCount)              → engine
 *   engine.state()                       → full state payload
 *   engine.askQuestion(seat, text)       → { ok, answer, questionNumber, reason }
 *   engine.makeGuess(seat, text)         → { ok, correct, isGameOver, reason }
 *   engine.isGameOver()                  → bool
 *   engine.winner()                      → seat index | null
 */

// ── Subject Bank ────────────────────────────────────────────────────────────
// Each subject has structured properties for deterministic question answering.

const SUBJECT_BANK = [
  // ── Famous People ────────────────────────────────────────────────────────
  {
    name: 'Lee Kuan Yew',
    aliases: ['lky', 'harry lee'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: true, isAnEntertainer: false, isAnAthlete: false,
      isALeader: true, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Bruce Lee',
    aliases: ['lee jun-fan'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: true, isAnAthlete: true,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Queen Elizabeth II',
    aliases: ['queen elizabeth', 'the queen', 'elizabeth'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: true,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: true, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Jackie Chan',
    aliases: ['chan kong-sang'],
    category: 'famous-person',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: true, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Albert Einstein',
    aliases: ['einstein'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: true, isModern: false,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Michael Jackson',
    aliases: ['mj', 'king of pop'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: true, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Mahatma Gandhi',
    aliases: ['gandhi'],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: true, isModern: false,
      isAPolitician: true, isAnEntertainer: false, isAnAthlete: false,
      isALeader: true, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Taylor Swift',
    aliases: [],
    category: 'famous-person',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: true,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: true, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Cristiano Ronaldo',
    aliases: ['ronaldo', 'cr7'],
    category: 'famous-person',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: true, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: true,
      isALeader: false, worksOutdoors: true,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Cleopatra',
    aliases: [],
    category: 'famous-person',
    properties: {
      isAlive: false, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: true,
      isHistorical: true, isModern: false,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: true, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },

  // ── Animals ──────────────────────────────────────────────────────────────
  {
    name: 'Elephant',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: true, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
      isDangerous: true, isPet: false, hasTail: true,
    }
  },
  {
    name: 'Panda',
    aliases: ['giant panda'],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: true, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Eagle',
    aliases: ['bald eagle'],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: true, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: true, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Dolphin',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: true, livesInWater: true,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Tiger',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: true, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: true, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Penguin',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: true, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: true, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Snake',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: true, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: true,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Cat',
    aliases: ['house cat', 'kitten'],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: true, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Goldfish',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: true, livesInWater: true,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: true,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Butterfly',
    aliases: [],
    category: 'animal',
    properties: {
      isAlive: true, isHuman: false, isAnimal: true, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: true, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: true, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },

  // ── Food ─────────────────────────────────────────────────────────────────
  {
    name: 'Durian',
    aliases: ['king of fruits'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: true,
      isEdible: true, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: true, isSpicy: false, isSweet: true,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Pizza',
    aliases: [],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: true, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Ice Cream',
    aliases: ['icecream'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: true,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Chilli Crab',
    aliases: ['chili crab', 'singapore chilli crab'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: true, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Sushi',
    aliases: [],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Nasi Lemak',
    aliases: ['nasi'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: true, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Chocolate',
    aliases: ['chocolate bar'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: true,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Banana',
    aliases: [],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: true,
      isEdible: true, isManMade: false, isAPlace: false,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: true,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Chicken Rice',
    aliases: ['hainanese chicken rice'],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: true, isManMade: true, isAPlace: false,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Watermelon',
    aliases: [],
    category: 'food',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: true,
      isEdible: true, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: true, isSpicy: false, isSweet: true,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },

  // ── Countries ────────────────────────────────────────────────────────────
  {
    name: 'Japan',
    aliases: ['nippon'],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Singapore',
    aliases: ['sg'],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: true, isInSingapore: true, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Australia',
    aliases: ['oz', 'aussie'],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'India',
    aliases: [],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'France',
    aliases: [],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Brazil',
    aliases: [],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'China',
    aliases: ['prc'],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: true, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Malaysia',
    aliases: [],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: true, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Egypt',
    aliases: [],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'United States',
    aliases: ['usa', 'america', 'us', 'united states of america'],
    category: 'country',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: true,
      isInAsia: false, isInSingapore: false, isFamous: true,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },

  // ── Objects ──────────────────────────────────────────────────────────────
  {
    name: 'Umbrella',
    aliases: [],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: true, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Piano',
    aliases: ['keyboard'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Bicycle',
    aliases: ['bike'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: true,
    }
  },
  {
    name: 'Television',
    aliases: ['tv', 'telly'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: true, hasWheels: false,
    }
  },
  {
    name: 'Guitar',
    aliases: [],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Camera',
    aliases: [],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: true, hasWheels: false,
    }
  },
  {
    name: 'Telephone',
    aliases: ['phone', 'mobile phone', 'handphone'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: true, hasWheels: false,
    }
  },
  {
    name: 'Aeroplane',
    aliases: ['airplane', 'plane', 'aircraft'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: true, canSwim: false, livesInWater: false,
      isLargerThanCar: true, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: true, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: true, hasWheels: true,
    }
  },
  {
    name: 'Book',
    aliases: [],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Clock',
    aliases: ['watch'],
    category: 'object',
    properties: {
      isAlive: false, isHuman: false, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: true, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: false, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: true,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: true, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },

  // ── Occupations ──────────────────────────────────────────────────────────
  {
    name: 'Teacher',
    aliases: ['school teacher'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Doctor',
    aliases: ['physician', 'medical doctor'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Firefighter',
    aliases: ['fireman'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: true,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Pilot',
    aliases: ['airline pilot'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: true, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Chef',
    aliases: ['cook'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: true, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Police Officer',
    aliases: ['policeman', 'policewoman', 'cop'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: true,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Astronaut',
    aliases: ['spaceman'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: true, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: true,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: true,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Farmer',
    aliases: [],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: true, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: true,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Nurse',
    aliases: [],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: false, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
  {
    name: 'Singer',
    aliases: ['vocalist'],
    category: 'occupation',
    properties: {
      isAlive: true, isHuman: true, isAnimal: false, isPlant: false,
      isEdible: false, isManMade: false, isAPlace: false,
      isInAsia: false, isInSingapore: false, isFamous: false,
      hasLegs: true, canFly: false, canSwim: false, livesInWater: false,
      isLargerThanCar: false, isSmall: false,
      isMale: false, isFemale: false,
      isHistorical: false, isModern: true,
      isAPolitician: false, isAnEntertainer: true, isAnAthlete: false,
      isALeader: false, worksOutdoors: false,
      hasWings: false, hasFur: false, hasScales: false,
      isRound: false, isSpicy: false, isSweet: false,
      isHot: false, isCold: false,
      isElectronic: false, hasWheels: false,
    }
  },
];

// ── AI-powered question answering ─────────────────────────────────────────────
// Uses DeepSeek API (OpenAI-compatible) to accurately answer yes/no questions.
// Falls back to regex matching if API is unavailable.

const OpenAI = require('openai');

let deepseekClient = null;
try {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    deepseekClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
    console.log('[20Q] DeepSeek AI enabled for question answering');
  } else {
    console.warn('[20Q] DEEPSEEK_API_KEY not set — falling back to regex matching');
  }
} catch (e) {
  console.warn('[20Q] DeepSeek SDK init failed — falling back to regex matching');
}

/**
 * Ask DeepSeek to answer a question about the subject.
 * Returns:
 *   - 'yes' or 'no' for yes/no questions
 *   - { hint: '...' } for valid descriptive questions (e.g. "What color is it?")
 *   - 'rephrase' for giveaway questions (e.g. "What are you?", "Tell me the answer")
 */
async function askAI(subjectName, category, questionText) {
  if (!deepseekClient) return null; // fallback to regex

  try {
    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'You are the answer bot in a 20 Questions game. You must protect the secret answer while being helpful.'
        },
        {
          role: 'user',
          content: `The secret answer is "${subjectName}" (category: ${category}).

A player asked: "${questionText}"

Rules:
1. If this is a YES/NO question, reply with EXACTLY: "yes" or "no" (factually correct).
2. If this is a descriptive question that does NOT give away the answer directly (e.g. "what color is it?", "where can you find it?", "how big is it?", "what does it eat?"), give a SHORT helpful hint (3-8 words max). Do NOT mention the answer's name. Start your reply with "HINT: " followed by the hint.
3. If the question would directly reveal the answer (e.g. "what are you?", "what is the answer?", "tell me what it is", "what's your name?"), reply with EXACTLY: "rephrase"

Examples:
- "Is it an animal?" → "yes"
- "Can it fly?" → "no"
- "What color is it?" → "HINT: It is grey"
- "Where does it live?" → "HINT: In Africa and Asia"
- "What are you?" → "rephrase"
- "Tell me the answer" → "rephrase"`
        }
      ]
    });

    const raw = (response.choices[0]?.message?.content || '').trim();
    const lower = raw.toLowerCase();

    // Check for hint response
    if (lower.startsWith('hint:')) {
      const hintText = raw.substring(5).trim();
      return { hint: hintText };
    }

    // Check for yes/no/rephrase
    if (lower === 'yes' || lower === 'no' || lower === 'rephrase') {
      return lower;
    }
    if (lower.startsWith('yes')) return 'yes';
    if (lower.startsWith('no')) return 'no';
    if (lower.startsWith('rephrase')) return 'rephrase';

    // If it looks like a short descriptive answer, treat as hint
    if (raw.length > 0 && raw.length <= 60) {
      return { hint: raw };
    }

    return 'rephrase';
  } catch (e) {
    console.error('[20Q] AI question error:', e.message);
    return null; // fallback to regex
  }
}

// ── Fallback regex patterns (used when AI is unavailable) ────────────────────
const QUESTION_PATTERNS = [
  { regex: /\b(alive|living|still alive)\b/i, property: 'isAlive' },
  { regex: /\b(dead|died|deceased|no longer alive)\b/i, property: 'isAlive', negate: true },
  { regex: /\b(human|person|people|somebody|someone)\b/i, property: 'isHuman' },
  { regex: /\b(animal|creature|beast)\b/i, property: 'isAnimal' },
  { regex: /\b(plant|tree|flower|vegetable)\b/i, property: 'isPlant' },
  { regex: /\b(eat|edible|food|consume|tasty|cook|meal)\b/i, property: 'isEdible' },
  { regex: /\b(man.?made|manufactured|artificial|built|invented)\b/i, property: 'isManMade' },
  { regex: /\b(place|location|country|city|nation|visit|travel)\b/i, property: 'isAPlace' },
  { regex: /\b(asia|asian)\b/i, property: 'isInAsia' },
  { regex: /\b(singapore|singaporean)\b/i, property: 'isInSingapore' },
  { regex: /\b(famous|well.?known|popular|iconic)\b/i, property: 'isFamous' },
  { regex: /\b(legs?|walk|feet|foot)\b/i, property: 'hasLegs' },
  { regex: /\b(fly|flies|flying|airborne|soar)\b/i, property: 'canFly' },
  { regex: /\b(ocean|sea|marine|aquatic|underwater|lives? in water)\b/i, property: 'livesInWater' },
  { regex: /\b(swim|swims|swimming)\b/i, property: 'canSwim' },
  { regex: /\b(big|large|huge|enormous|gigantic|massive)\b/i, property: 'isLargerThanCar' },
  { regex: /\b(small|tiny|little|miniature|compact)\b/i, property: 'isSmall' },
  { regex: /\b(male|man|boy|he|him)\b/i, property: 'isMale' },
  { regex: /\b(female|woman|girl|she|her)\b/i, property: 'isFemale' },
  { regex: /\b(historical|ancient|old|from the past)\b/i, property: 'isHistorical' },
  { regex: /\b(modern|current|contemporary|today)\b/i, property: 'isModern' },
  { regex: /\b(politician|political|government|minister|president)\b/i, property: 'isAPolitician' },
  { regex: /\b(entertain|actor|actress|movie|film|music|sing|dance|perform)\b/i, property: 'isAnEntertainer' },
  { regex: /\b(athlete|sport|football|soccer|basketball|tennis|olympic)\b/i, property: 'isAnAthlete' },
  { regex: /\b(leader|ruler|king|queen|emperor|chief|head of state)\b/i, property: 'isALeader' },
  { regex: /\b(outdoors?|outside|open air|field)\b/i, property: 'worksOutdoors' },
  { regex: /\b(wings?|feather)\b/i, property: 'hasWings' },
  { regex: /\b(fur|furry|hairy|fluffy)\b/i, property: 'hasFur' },
  { regex: /\b(scales?|scaly|reptile)\b/i, property: 'hasScales' },
  { regex: /\b(round|circular|sphere)\b/i, property: 'isRound' },
  { regex: /\b(spicy|spice|chilli|chili|pepper)\b/i, property: 'isSpicy' },
  { regex: /\b(sweet|sugary|sugar|dessert|candy)\b/i, property: 'isSweet' },
  { regex: /\b(hot|warm|heat|tropical)\b/i, property: 'isHot' },
  { regex: /\b(cold|cool|frozen|ice|icy|freezing)\b/i, property: 'isCold' },
  { regex: /\b(electronic|electric|battery|digital|screen|computer)\b/i, property: 'isElectronic' },
  { regex: /\b(wheels?|roll|tyre|tire|drive|vehicle)\b/i, property: 'hasWheels' },
  { regex: /\b(dangerous|deadly|scary|poisonous|venomous|bite|attack)\b/i, property: 'isDangerous' },
  { regex: /\b(pet|domesticated|tame|keep at home)\b/i, property: 'isPet' },
  { regex: /\b(tail)\b/i, property: 'hasTail' },
];

// ── Category labels for display ─────────────────────────────────────────────
const CATEGORY_LABELS = {
  'famous-person': 'Famous Person',
  'animal':        'Animal',
  'food':          'Food',
  'country':       'Country',
  'object':        'Object',
  'occupation':    'Occupation',
};

const MAX_QUESTIONS = 20;
const COOLDOWN_MS = 2000; // 2s between questions per player

// ── Engine ──────────────────────────────────────────────────────────────────

function createGame(playerCount = 2) {
  if (playerCount < 1 || playerCount > 8) throw new Error('20 Questions requires 1–8 players');

  // Pick a random subject
  const subjectIndex = Math.floor(Math.random() * SUBJECT_BANK.length);
  const subject = SUBJECT_BANK[subjectIndex];

  const questionsAsked = [];   // { seat, text, answer }
  let questionsUsed = 0;       // only yes/no count against limit
  let _isGameOver = false;
  let _winnerSeat = null;
  const lastQuestionTime = new Array(playerCount).fill(0); // per-seat cooldown

  function matchQuestionRegex(text) {
    const normalized = text.toLowerCase().trim();
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.regex.test(normalized)) {
        const val = subject.properties[pattern.property];
        if (val === undefined) return 'unsure';
        let answer = !!val;
        if (pattern.negate) answer = !answer;
        return answer ? 'yes' : 'no';
      }
    }
    return 'unsure';
  }

  async function matchQuestion(text) {
    // Try AI first for accurate answers
    const aiAnswer = await askAI(subject.name, subject.category, text);
    if (aiAnswer) return aiAnswer; // 'yes', 'no', 'rephrase', or { hint: '...' }

    // Fallback to regex if AI is unavailable
    return matchQuestionRegex(text);
  }

  function normalizeGuess(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  function checkGuess(text) {
    const guess = normalizeGuess(text);
    const answer = normalizeGuess(subject.name);

    // Exact match
    if (guess === answer) return true;

    // Check aliases
    for (const alias of (subject.aliases || [])) {
      if (guess === normalizeGuess(alias)) return true;
    }

    // Substring containment (answer in guess or guess in answer, min 3 chars)
    if (guess.length >= 3 && (answer.includes(guess) || guess.includes(answer))) return true;

    return false;
  }

  async function askQuestion(seat, text) {
    if (_isGameOver) return { ok: false, reason: 'Game is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (!text || text.trim().length === 0) return { ok: false, reason: 'Question is empty' };
    if (text.trim().length > 200) return { ok: false, reason: 'Question too long' };

    // Cooldown check
    const now = Date.now();
    if (now - lastQuestionTime[seat] < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastQuestionTime[seat])) / 1000);
      return { ok: false, reason: `Wait ${remaining}s before asking another question` };
    }

    // Check question limit (only yes/no count)
    if (questionsUsed >= MAX_QUESTIONS) {
      return { ok: false, reason: 'All 20 questions have been used. You can only guess now!' };
    }

    const answer = await matchQuestion(text);

    // If the question would give away the answer, ask user to rephrase
    if (answer === 'rephrase') {
      return {
        ok: false,
        reason: 'That question would give away the answer! Try asking something else.'
      };
    }

    // 'unsure' from regex fallback — also ask to rephrase
    if (answer === 'unsure') {
      return {
        ok: false,
        reason: 'I\'m not sure how to answer that. Try rephrasing your question!'
      };
    }

    // Handle hint (descriptive answer from AI)
    if (typeof answer === 'object' && answer.hint) {
      const entry = { seat, text: text.trim(), answer: 'hint', hint: answer.hint };
      questionsAsked.push(entry);
      lastQuestionTime[seat] = now;
      questionsUsed++;

      return {
        ok: true,
        answer: 'hint',
        hint: answer.hint,
        questionNumber: questionsUsed,
        maxQuestions: MAX_QUESTIONS
      };
    }

    const entry = { seat, text: text.trim(), answer };
    questionsAsked.push(entry);
    lastQuestionTime[seat] = now;

    // yes/no answers count against the 20 limit
    questionsUsed++;

    return {
      ok: true,
      answer,
      questionNumber: questionsUsed,
      maxQuestions: MAX_QUESTIONS
    };
  }

  function makeGuess(seat, text) {
    if (_isGameOver) return { ok: false, reason: 'Game is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (!text || text.trim().length === 0) return { ok: false, reason: 'Guess is empty' };

    const correct = checkGuess(text);

    // Record the guess in the Q&A log
    questionsAsked.push({
      seat,
      text: text.trim(),
      answer: correct ? 'correct' : 'wrong-guess',
      isGuess: true
    });

    if (correct) {
      _isGameOver = true;
      _winnerSeat = seat;
    }

    return {
      ok: true,
      correct,
      isGameOver: _isGameOver,
      winnerSeat: _winnerSeat,
      answer: subject.name
    };
  }

  function giveUp() {
    _isGameOver = true;
    return { answer: subject.name };
  }

  function state() {
    return {
      gameType: 'tv-20-questions',
      category: CATEGORY_LABELS[subject.category] || subject.category,
      questionsAsked: questionsAsked.slice(),
      questionsUsed,
      maxQuestions: MAX_QUESTIONS,
      questionsRemaining: MAX_QUESTIONS - questionsUsed,
      isGameOver: _isGameOver,
      winnerSeat: _winnerSeat,
      answer: _isGameOver ? subject.name : null, // only reveal when game over
      playerCount,
    };
  }

  function isGameOver() { return _isGameOver; }
  function winner() { return _winnerSeat; }

  return { state, askQuestion, makeGuess, giveUp, isGameOver, winner };
}

module.exports = { createGame, SUBJECT_BANK, CATEGORY_LABELS, MAX_QUESTIONS };
