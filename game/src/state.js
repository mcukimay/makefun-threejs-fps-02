// One place for the match: phase, round, score, timer, kills and deaths, and the
// transitions between them. The fixed-step loop in main.js reads this and nothing
// else decides a round. First to 5 rounds takes the match; a tie at 4-4 plays a
// deciding round 9.
export const WIN_ROUNDS = 5;
export const ROUND_TIME = 100;
export const BUY_TIME = 12;

export function createMatch() {
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    scoreV: 0,
    scoreE: 0,
    timer: BUY_TIME,
    kills: 0,
    deaths: 0,
    planted: false,
    winner: null,
    roundReason: '',
    time: 0,
  };

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.scoreV = 0;
      state.scoreE = 0;
      state.timer = BUY_TIME;
      state.kills = 0;
      state.deaths = 0;
      state.planted = false;
      state.winner = null;
      state.roundReason = '';
    },
    startRound() {
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.planted = false;
      state.roundReason = '';
    },
    beginLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    endRound(winner, reason) {
      state.phase = 'roundEnd';
      state.roundReason = reason;
      if (winner === 'vanguard') state.scoreV += 1;
      else if (winner === 'ember') state.scoreE += 1;
      state.winner = winner;
    },
    nextRound() {
      if (state.scoreV >= WIN_ROUNDS || state.scoreE >= WIN_ROUNDS) {
        state.phase = 'matchEnd';
        return false;
      }
      state.round += 1;
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.planted = false;
      return true;
    },
    tick(dt) {
      state.time += dt;
      if (state.phase === 'buy' || state.phase === 'live') {
        state.timer -= dt;
      }
    },
  };
}
