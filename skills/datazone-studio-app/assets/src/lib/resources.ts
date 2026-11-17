import { apiFetch, branch, branchQuery, projectId } from "@/lib/datazone";

/**
 * Every Datazone resource the app uses, by name, in one place.
 *
 * Ids and endpoint slugs differ per deployment, and slugs differ per branch, so nothing here is
 * hardcoded: each one is looked up by name on this bundle's branch, once per page load.
 */
export const ENDPOINTS = {
  salesRows: "Sales Rows",
  salesByDay: "Sales By Day",
} as const;

export const OBJECTS = {
  order: "Order",
} as const;

type Page<T> = { items: T[]; total_count: number };

const lookups = new Map<string, Promise<string>>();

function once(cacheKey: string, lookup: () => Promise<string>): Promise<string> {
  let pending = lookups.get(cacheKey);
  if (!pending) {
    // A failed lookup is not cached, so the next call retries instead of failing forever.
    pending = lookup().catch((problem) => {
      lookups.delete(cacheKey);
      throw problem;
    });
    lookups.set(cacheKey, pending);
  }
  return pending;
}

/** The slug of the endpoint with this name on this branch. List items carry it only as definition.slug. */
export function endpointSlug(name: string): Promise<string> {
  return once(`endpoint:${name}`, async () => {
    const page = await apiFetch<Page<{ definition: { slug: string } }>>(
      `/endpoint/list?${branchQuery({ name, "project.$id": projectId })}`,
    );
    const endpoint = page.items[0];
    if (!endpoint) throw new Error(`Endpoint "${name}" is not deployed on ${branch}`);
    return endpoint.definition.slug;
  });
}

/** The id of the knowledge object with this name on this branch. Instance routes take the id, not the name. */
export function objectId(name: string): Promise<string> {
  return once(`object:${name}`, async () => {
    const page = await apiFetch<Page<{ id: string }>>(
      `/knowledge-object/list?${branchQuery({ name, "project.$id": projectId })}`,
    );
    const object = page.items[0];
    if (!object) throw new Error(`Object "${name}" is not deployed on ${branch}`);
    return object.id;
  });
}
