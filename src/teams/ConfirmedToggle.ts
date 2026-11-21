/** Keep an optimistic control value until both its HTTP acknowledgement and state snapshot agree. */
export class ConfirmedToggle {
  private remote = false;
  private desired?: boolean;
  private acknowledged = false;
  private revision = 0;
  get value() {
    return this.desired ?? this.remote;
  }
  get pending() {
    return this.desired !== undefined;
  }
  request(value: boolean) {
    if (this.pending) return undefined;
    this.desired = value;
    this.acknowledged = false;
    return ++this.revision;
  }
  receive(value: boolean) {
    this.remote = value;
    this.settle();
  }
  acknowledge(revision: number) {
    if (revision !== this.revision || !this.pending) return;
    this.acknowledged = true;
    this.settle();
  }
  cancel(revision: number) {
    if (revision !== this.revision) return;
    this.desired = undefined;
    this.acknowledged = false;
  }
  private settle() {
    if (this.acknowledged && this.desired === this.remote) {
      this.desired = undefined;
      this.acknowledged = false;
    }
  }
}
