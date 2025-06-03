import { describe, it, expect } from 'vitest';
import { getSchemasFromFilePaths } from '../../src/lib/eventcatalog';

describe('eventcatalog', () => {
  describe('getSchemasFromFilePaths', () => {
    it('filters and returns only schema files that have changed in a list of file paths', () => {
      const filePaths = [
        'events/MyEvent/MyEvent.json',
        'queries/MyQuery/MyQuery.yaml',
        'commands/MyCommand/MyCommand.proto',
        'docs/README.md',
        'package.json',
        'events/MyEvent/MyEvent.avsc',
        'events/MyEvent/MyEvent.avro',
        'events/MyEvent/MyEvent.thrift',
        'events/MyEvent/MyEvent.xml',
        'events/MyEvent/versioned/1.0.0/MyEvent.avro',
        'events/MyEvent/versioned/1.0.0/MyEvent.json',
      ];
      const schemas = getSchemasFromFilePaths(filePaths);
      expect(schemas).toEqual([
        'events/MyEvent/MyEvent.json',
        'queries/MyQuery/MyQuery.yaml',
        'commands/MyCommand/MyCommand.proto',
        'events/MyEvent/MyEvent.avsc',
        'events/MyEvent/MyEvent.avro',
        'events/MyEvent/MyEvent.thrift',
        'events/MyEvent/MyEvent.xml',
        'events/MyEvent/versioned/1.0.0/MyEvent.avro',
        'events/MyEvent/versioned/1.0.0/MyEvent.json',
      ]);
    });
  });
});
