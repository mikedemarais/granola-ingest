import { Database } from 'bun:sqlite';
import { debug } from '../utils/logger';
import type { Person } from '../models/types';

export class PersonService {
  private preparedStatements: {
    upsertPerson?: any;
  } = {};

  constructor(private db: Database) {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements() {
    this.preparedStatements.upsertPerson = this.db.prepare(`
      INSERT INTO people (
        id, document_id, email, name, role,
        response_status, avatar_url, company_name, job_title
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        role = excluded.role,
        response_status = excluded.response_status,
        avatar_url = excluded.avatar_url,
        company_name = excluded.company_name,
        job_title = excluded.job_title
    `);
  }

  upsertPerson(person: Person) {
    debug('PersonService', 'Upserting person', {
      personId: person.id,
      docId: person.document_id,
      email: person.email,
      role: person.role
    });

    return this.preparedStatements.upsertPerson.run(
      person.id,
      person.document_id,
      person.email,
      person.name,
      person.role,
      person.response_status,
      person.avatar_url,
      person.company_name,
      person.job_title
    );
  }
}