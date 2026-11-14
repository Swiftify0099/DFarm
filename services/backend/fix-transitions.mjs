import fs from 'node:fs';

const file = 'src/modules/identification/identification.service.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. In identifyByFace: Remove the erroneous transition
const erroneousFaceTransition = `    if (session.currentState === IdentificationState.WAITING_FOR_FACE) {
      IdentificationSessionStore.transition({
        sessionId: session.sessionId,
        nextState: IdentificationState.WAITING_FOR_RFID,
        method: IdentificationMethod.RFID,
        outcome: VerificationOutcome.FAILED,
      });
    }`;

code = code.replace(erroneousFaceTransition, '');

// 2. In identifyByRfid: Ensure only WAITING_FOR_FACE -> WAITING_FOR_RFID
const rfidFaulty = `    if (session.currentState === IdentificationState.WAITING_FOR_FACE) {
      IdentificationSessionStore.transition({
        sessionId: session.sessionId,
        nextState: IdentificationState.WAITING_FOR_RFID,
        method: IdentificationMethod.SUPERVISOR_MANUAL,
        outcome: VerificationOutcome.FAILED,
      });
    }
    if (session.currentState === IdentificationState.WAITING_FOR_RFID) {
      IdentificationSessionStore.transition({
        sessionId: session.sessionId,
        nextState: IdentificationState.WAITING_FOR_SUPERVISOR,
        method: IdentificationMethod.SUPERVISOR_MANUAL,
        outcome: VerificationOutcome.FAILED,
      });
    }`;

const rfidCorrect = `    if (session.currentState === IdentificationState.WAITING_FOR_FACE) {
      IdentificationSessionStore.transition({
        sessionId: session.sessionId,
        nextState: IdentificationState.WAITING_FOR_RFID,
        method: IdentificationMethod.RFID,
        outcome: VerificationOutcome.FAILED,
      });
    }`;

code = code.replace(rfidFaulty, rfidCorrect);

fs.writeFileSync(file, code, 'utf8');
console.log('Fixed state machine transitions in identification.service.ts');
