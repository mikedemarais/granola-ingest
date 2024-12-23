import { HashUtil } from '../utils/hashing';
import type { Document, CalendarEvent, TranscriptEntry, Person } from '../models/types';

interface LastKnownState {
  documentHashes: { [docId: string]: string };
  calendarHashes: { [docId: string]: string };
  transcriptHashes: { [docId: string]: { [entryId: string]: string } };
  personHashes: { [docId: string]: { [personId: string]: string } };
}

export class StateTrackingService {
  private lastKnownState: LastKnownState = {
    documentHashes: {},
    calendarHashes: {},
    transcriptHashes: {},
    personHashes: {}
  };

  async hasDocumentChanged(doc: Document): Promise<boolean> {
    const hash = await HashUtil.getHash(JSON.stringify(doc));
    const changed = hash !== this.lastKnownState.documentHashes[doc.id];
    if (changed) {
      this.lastKnownState.documentHashes[doc.id] = hash;
    }
    return changed; 
  }

  async hasCalendarEventChanged(docId: string, event: CalendarEvent): Promise<boolean> {
    const hash = await HashUtil.getHash(JSON.stringify(event));
    const changed = hash !== this.lastKnownState.calendarHashes[docId];
    if (changed) {
      this.lastKnownState.calendarHashes[docId] = hash;
    }
    return changed;
  }

  async hasTranscriptChanged(docId: string, entry: TranscriptEntry): Promise<boolean> {
    const hash = await HashUtil.getHash(JSON.stringify(entry));
    const docTranscripts = this.lastKnownState.transcriptHashes[docId] || {};
    const changed = hash !== docTranscripts[entry.id];
    if (changed) {
      if (!this.lastKnownState.transcriptHashes[docId]) {
        this.lastKnownState.transcriptHashes[docId] = {};
      }
      this.lastKnownState.transcriptHashes[docId][entry.id] = hash;
    }
    return changed;
  }

  async hasPersonChanged(docId: string, person: Person): Promise<boolean> {
    const hash = await HashUtil.getHash(JSON.stringify(person));
    const docPeople = this.lastKnownState.personHashes[docId] || {};
    const changed = hash !== docPeople[person.id];
    if (changed) {
      if (!this.lastKnownState.personHashes[docId]) {
        this.lastKnownState.personHashes[docId] = {};
      }
      this.lastKnownState.personHashes[docId][person.id] = hash;
    }
    return changed;
  }
}