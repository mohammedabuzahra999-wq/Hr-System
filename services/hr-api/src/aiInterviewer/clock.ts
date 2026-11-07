export interface InterviewClock { now(): number }

/** The only wall-clock dependency in this domain. All values are epoch ms. */
export const systemInterviewClock: InterviewClock = { now: () => Date.now() }

export class FakeClock implements InterviewClock {
  constructor(private time = 1_800_000_000_000) {
    if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid fake time')
  }
  now() { return this.time }
  advance(ms: number) {
    if (!Number.isSafeInteger(ms) || ms < 0 || !Number.isSafeInteger(this.time + ms)) throw new Error('Clock must advance by safe nonnegative milliseconds')
    this.time += ms
  }
}
