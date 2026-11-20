import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';

/**
 * Minimal Zod resolver for React Hook Form.
 *
 * The published @hookform/resolvers package currently pulls a conflicting
 * optional peer dependency in this environment, and this project only needs
 * flat object schemas, so the adapter is implemented locally (about 30 lines)
 * instead of forcing a dependency conflict.
 */
export function zodResolver<T extends FieldValues>(schema: ZodTypeAny): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: { ...(result.data as T) }, errors: {} };
    }
    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.map(String) : ['root'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let node: any = errors;
      for (let i = 0; i < path.length - 1; i += 1) {
        node[path[i]] = node[path[i]] ?? {};
        node = node[path[i]];
      }
      const leaf = path[path.length - 1];
      if (!node[leaf]) node[leaf] = { type: issue.code, message: issue.message };
    }
    return { values: {} as T, errors: errors as never };
  };
}
