export interface Document {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    user_id: string;
    notes_markdown: string;
    notes_plain: string;
    transcribe: boolean;
    public: boolean;
    type: string | null;
    valid_meeting: boolean;
    has_shareable_link: boolean;
    creation_source: string;
    subscription_plan_id: string | null;
    privacy_mode_enabled: boolean;
    google_calendar_event?: CalendarEvent;
  }
  
  export interface CalendarEvent {
    id: string;
    document_id?: string;
    summary: string;
    description: string | null;
    start_time: string;
    end_time: string;
    timezone: string;
    status: string;
    calendar_id: string;
    html_link: string;
    hangout_link: string | null;
    location: string | null;
    organizer_email: string;
    created_at: string;
    updated_at: string;
    attendees?: CalendarAttendee[];
  }
  
  export interface CalendarAttendee {
    email: string;
    displayName: string;
    organizer?: boolean;
    responseStatus?: string;
  }
  
  export interface Person {
    id: string;
    document_id: string;
    email: string;
    name: string | null;
    role: string | null;
    response_status: string | null | undefined;
    avatar_url: string | null;
    company_name: string | null;
    job_title: string | null;
  }
  
  export interface TranscriptEntry {
    id: string;
    text: string;
    source: string;
    speaker: string;
    start_timestamp: string;
    end_timestamp: string;
    is_final: boolean;
    sequence_number: number;
  }