#!/usr/bin/env -S node
// users.class_id → classes(id): FK на живом БД легла как NO ACTION (несмотря
// на ON DELETE SET NULL в init-миграции), из-за чего удаление класса с
// учениками падало с 500 (FK-violation). Пересоздаём constraint с явным
// ON DELETE SET NULL ON UPDATE CASCADE — как обещает админ-панель
// ("Ученики останутся без класса").
import type { Contract as Start } from '../../snapshots/9c37a848cf29b8f6697e3bc7edcf0f619900ffc4e4f45261b64b647fbe05a25f/contract';
import startContract from '../../snapshots/9c37a848cf29b8f6697e3bc7edcf0f619900ffc4e4f45261b64b647fbe05a25f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/0d880dfeffd5b3984a8a93b9ad2afd13c0bf555b8f2e0c3aa8e0c45b538e31a0/contract';
import endContract from '../../snapshots/0d880dfeffd5b3984a8a93b9ad2afd13c0bf555b8f2e0c3aa8e0c45b538e31a0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_class_id_fkey',
        kind: 'foreignKey',
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'users',
        foreignKey: {
          name: 'users_class_id_fkey',
          columns: ['class_id'],
          references: { schema: 'public', table: 'classes', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
