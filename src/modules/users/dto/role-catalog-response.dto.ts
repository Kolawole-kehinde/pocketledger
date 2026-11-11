import type { RoleCatalogEntry } from '../../authorization/permissions.js';

export class RoleCatalogEntryResponseDto {
  role: RoleCatalogEntry['role'];
  label: string;
  description: string;
  level: number;
  isDefault: boolean;
  permissions: string[];

  constructor(entry: RoleCatalogEntry) {
    this.role = entry.role;
    this.label = entry.label;
    this.description = entry.description;
    this.level = entry.level;
    this.isDefault = entry.isDefault;
    this.permissions = entry.permissions;
  }
}
