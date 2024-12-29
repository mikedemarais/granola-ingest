import { Database } from 'bun:sqlite';
import { debug, logger } from '../utils/logger';

export interface PanelTemplate {
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

export interface TemplateSection {
  id: string;
  template_id: string;
  heading: string | null;
  section_description: string | null;
  sequence_number: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentPanel {
  id: string;
  document_id: string;
  template_id: string;
  content: any;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
}

export class TemplateService {
  private preparedStatements: {
    upsertPanelTemplate?: any;
    upsertTemplateSection?: any;
    upsertDocumentPanel?: any;
    getPanelTemplate?: any;
    getTemplateSection?: any;
    getDocumentPanel?: any;
  } = {};

  constructor(private db: Database) {}

  async initialize() {
    try {
      await this.initializePreparedStatements();
      debug('TemplateService', 'Successfully initialized prepared statements');
    } catch (error) {
      logger.error('Failed to initialize TemplateService:', error);
      throw error;
    }
  }

  private async initializePreparedStatements() {
    try {
      // Panel Templates
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
          is_granola = excluded.is_granola,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          shared_with = excluded.shared_with,
          user_types = excluded.user_types
      `);

      this.preparedStatements.getPanelTemplate = this.db.prepare(`
        SELECT * FROM panel_templates WHERE id = ? AND deleted_at IS NULL
      `);

      // Template Sections
      this.preparedStatements.upsertTemplateSection = this.db.prepare(`
        INSERT INTO template_sections (
          id, template_id, heading, section_description, sequence_number,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          heading = excluded.heading,
          section_description = excluded.section_description,
          sequence_number = excluded.sequence_number,
          updated_at = CURRENT_TIMESTAMP
      `);

      this.preparedStatements.getTemplateSection = this.db.prepare(`
        SELECT * FROM template_sections WHERE id = ?
      `);

      // Document Panels
      this.preparedStatements.upsertDocumentPanel = this.db.prepare(`
        INSERT INTO document_panels (
          id, document_id, template_id, content, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT (id) DO UPDATE SET
          content = excluded.content,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `);

      this.preparedStatements.getDocumentPanel = this.db.prepare(`
        SELECT * FROM document_panels WHERE id = ? AND deleted_at IS NULL
      `);

      debug('TemplateService', 'Prepared statements initialized');
    } catch (error) {
      logger.error('Error initializing prepared statements:', error);
      throw new Error(`Failed to prepare statements: ${(error as Error).message}`);
    }
  }

  async upsertPanelTemplate(template: PanelTemplate) {
    try {
      debug('TemplateService', 'Upserting panel template', {
        id: template.id,
        title: template.title,
      });

      return this.preparedStatements.upsertPanelTemplate.run(
        template.id,
        template.category,
        template.title,
        template.description,
        template.color,
        template.symbol,
        template.is_granola,
        template.created_at,
        template.updated_at,
        template.deleted_at,
        template.shared_with,
        JSON.stringify(template.user_types || {})
      );
    } catch (error) {
      logger.error('Error upserting panel template:', error, { templateId: template.id });
      throw error;
    }
  }

  async upsertTemplateSection(section: TemplateSection) {
    try {
      debug('TemplateService', 'Upserting template section', {
        id: section.id,
        templateId: section.template_id,
      });

      return this.preparedStatements.upsertTemplateSection.run(
        section.id,
        section.template_id,
        section.heading,
        section.section_description,
        section.sequence_number
      );
    } catch (error) {
      logger.error('Error upserting template section:', error, { sectionId: section.id });
      throw error;
    }
  }

  async upsertDocumentPanel(panel: DocumentPanel) {
    try {
      debug('TemplateService', 'Upserting document panel', {
        id: panel.id,
        documentId: panel.document_id,
        templateId: panel.template_id,
      });

      return this.preparedStatements.upsertDocumentPanel.run(
        panel.id,
        panel.document_id,
        panel.template_id,
        JSON.stringify(panel.content || {}),
        panel.created_at,
        panel.updated_at,
        panel.deleted_at
      );
    } catch (error) {
      logger.error('Error upserting document panel:', error, { panelId: panel.id });
      throw error;
    }
  }

  async getPanelTemplate(id: string): Promise<PanelTemplate | null> {
    try {
      const result = this.preparedStatements.getPanelTemplate.get(id);
      if (result) {
        result.user_types = JSON.parse(result.user_types || '{}');
      }
      return result;
    } catch (error) {
      logger.error('Error getting panel template:', error, { templateId: id });
      throw error;
    }
  }

  async getTemplateSection(id: string): Promise<TemplateSection | null> {
    try {
      return this.preparedStatements.getTemplateSection.get(id);
    } catch (error) {
      logger.error('Error getting template section:', error, { sectionId: id });
      throw error;
    }
  }

  async getDocumentPanel(id: string): Promise<DocumentPanel | null> {
    try {
      const result = this.preparedStatements.getDocumentPanel.get(id);
      if (result) {
        result.content = JSON.parse(result.content || '{}');
      }
      return result;
    } catch (error) {
      logger.error('Error getting document panel:', error, { panelId: id });
      throw error;
    }
  }
}
