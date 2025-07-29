export const getSchemasFromFilePaths = (filePaths: string[]) => {
  const schemaFilePattern =
    /(?:^|\/)(events|queries|commands|domains)\/[^/]+(?:\/versioned\/[^/]+)?\/[^/]+\.(?:json|ya?ml|proto|avsc|avro|thrift|xml)$/;
  const filteredFilePaths = filePaths.filter((filePath: string) => schemaFilePattern.test(filePath));
  return filteredFilePaths;
};
