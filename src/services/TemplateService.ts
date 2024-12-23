import { Database } from 'bun:sqlite';
import { debug } from '../utils/logger';

interface PanelTemplate {
  id: string;
  category: string | null;
  title: string | null;
  description: string | null;
  color: string | null;
  symbol: string | null;
  is_granola: boolean;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  shared_with: string | null;
  user_types: any;
}

interface TemplateSection {
  id: string;
  template_id: string;
  heading: string | null;
  section_description: string | null;
  sequence_number: number | null;
}

interface DocumentPanel {
  id: string;
  document_id: string;
  template_id: string;
  content: any;
  created_at: string | null;
  updated_at: string | null;
}

export class TemplateService {
  private preparedStatements: {
    upsertPanelTemplate?: any;
    upsertTemplateSection?: any;
    upsertDocumentPanel?: any;
  } = {};

  constructor(private db: Database) {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements() {
    this.preparedStatements.upsertPanelTemplate = this.db.prepare(`
      INSERT INTO panel_templates (
        id, category, title, description, color, symbol,
        is_granola, created_at, updated_at, deleted_at,
        shared_with, user_types
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        category = excluded.category,
        title = excluded.title,
        description = excluded.description,
        color = excluded.color,
        symbol = excluded.symbol,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        shared_with = excluded.shared_with,
        user_types = excluded.user_types
    `);

    this.preparedStatements.upsertTemplateSection = this.db.prepare(`
      INSERT INTO template_sections (
        id, template_id, heading, section_description, sequence_number
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        heading = excluded.heading,
        section_description = excluded.section_description,
        sequence_number = excluded.sequence_number
    `);

    this.preparedStatements.upsertDocumentPanel = this.db.prepare(`
      INSERT INTO document_panels (
        id, document_id, template_id, content, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `);
  }

  upsertPanelTemplate(panelTemplate: PanelTemplate) {
    debug('TemplateService', 'Upserting panel template', {
      id: panelTemplate.id,
      title: panelTemplate.title
    });
    return this.preparedStatements.upsertPanelTemplate.run(
      panelTemplate.id,
      panelTemplate.category,
      panelTemplate.title,
      panelTemplate.description,
      panelTemplate.color,
      panelTemplate.symbol,
      panelTemplate.is_granola,
      panelTemplate.created_at,
      panelTemplate.updated_at,
      panelTemplate.deleted_at,
      panelTemplate.shared_with,
      JSON.stringify(panelTemplate.user_types || {})
    );
  }

  upsertTemplateSection(section: TemplateSection) {
    debug('TemplateService', 'Upserting template section', {
      id: section.id,
      template_id: section.template_id
    });
    return this.preparedStatements.upsertTemplateSection.run(
      section.id,
      section.template_id,
      section.heading,
      section.section_description,
      section.sequence_number
    );
  }

  upsertDocumentPanel(panel: DocumentPanel) {
    debug('TemplateService', 'Upserting document panel', {
      id: panel.id,
      docId: panel.document_id
    });
    return this.preparedStatements.upsertDocumentPanel.run(
      panel.id,
      panel.document_id,
      panel.template_id,
      JSON.stringify(panel.content || {}),
      panel.created_at,
      panel.updated_at
    );
  }
}