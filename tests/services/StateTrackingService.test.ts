import { beforeEach, describe, expect, test } from 'bun:test';
import type { CalendarEvent, Document, Person, TranscriptEntry } from '../../src/models/types';
import { StateTrackingService } from '../../src/services/StateTrackingService';

describe('StateTrackingService', () => {
  let stateTrackingService: StateTrackingService;
  let mockDocument: Document;
  let mockCalendarEvent: CalendarEvent;
  let mockPerson: Person;
  let mockTranscript: TranscriptEntry;

  beforeEach(() => {
    stateTrackingService = new StateTrackingService();

    mockDocument = {
      id: 'doc-123',
      title: 'Test Meeting',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      user_id: 'test-user',
      notes_markdown: '',
      notes_plain: '',
      transcribe: false,
      public: false,
      type: null,
      valid_meeting: false,
      has_shareable_link: false,
      creation_source: 'test',
      subscription_plan_id: null,
      privacy_mode_enabled: false,
    };

    mockCalendarEvent = {
      id: 'event-123',
      document_id: 'doc-123',
      summary: 'Test Event',
      description: 'Test description',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      timezone: 'UTC',
      status: 'confirmed',
      calendar_id: 'calendar-123',
      html_link: 'https://example.com',
      hangout_link: null,
      location: null,
      organizer_email: 'test@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attendees: [],
    };

    mockPerson = {
      id: 'person-123',
      document_id: 'doc-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'attendee',
      response_status: 'accepted',
      avatar_url: null,
      company_name: null,
      job_title: null,
    };

    mockTranscript = {
      id: 'transcript-123',
      text: 'Test transcript content',
      source: 'microphone',
      speaker: 'Test User',
      start_timestamp: new Date().toISOString(),
      end_timestamp: new Date().toISOString(),
      is_final: true,
      sequence_number: 1,
    };
  });

  test('should detect document changes', async () => {
    // First check should indicate change as it's new
    expect(await stateTrackingService.hasDocumentChanged(mockDocument)).toBe(true);

    // Second check with same document should indicate no change
    expect(await stateTrackingService.hasDocumentChanged(mockDocument)).toBe(false);

    // Modify document and check again
    const modifiedDoc = { ...mockDocument, title: 'Updated Title' };
    expect(await stateTrackingService.hasDocumentChanged(modifiedDoc)).toBe(true);
  });

  test('should detect calendar event changes', async () => {
    expect(
      await stateTrackingService.hasCalendarEventChanged(mockDocument.id, mockCalendarEvent)
    ).toBe(true);

    expect(
      await stateTrackingService.hasCalendarEventChanged(mockDocument.id, mockCalendarEvent)
    ).toBe(false);

    const modifiedEvent = { ...mockCalendarEvent, title: 'Updated Event' };
    expect(await stateTrackingService.hasCalendarEventChanged(mockDocument.id, modifiedEvent)).toBe(
      true
    );
  });

  test('should detect person changes', async () => {
    expect(await stateTrackingService.hasPersonChanged(mockDocument.id, mockPerson)).toBe(true);

    expect(await stateTrackingService.hasPersonChanged(mockDocument.id, mockPerson)).toBe(false);

    const modifiedPerson = { ...mockPerson, name: 'Updated Name' };
    expect(await stateTrackingService.hasPersonChanged(mockDocument.id, modifiedPerson)).toBe(true);
  });

  test('should detect transcript changes', async () => {
    expect(await stateTrackingService.hasTranscriptChanged(mockDocument.id, mockTranscript)).toBe(
      true
    );

    expect(await stateTrackingService.hasTranscriptChanged(mockDocument.id, mockTranscript)).toBe(
      false
    );

    const modifiedTranscript = { ...mockTranscript, content: 'Updated content' };
    expect(
      await stateTrackingService.hasTranscriptChanged(mockDocument.id, modifiedTranscript)
    ).toBe(true);
  });

  test('should handle null or undefined values', async () => {
    const invalidDoc = { ...mockDocument, subscription_plan_id: null };
    expect(await stateTrackingService.hasDocumentChanged(invalidDoc)).toBe(true);

    const undefinedDoc = { ...mockDocument };
    delete (undefinedDoc as any).subscription_plan_id;
    expect(await stateTrackingService.hasDocumentChanged(undefinedDoc)).toBe(true);
  });
});
