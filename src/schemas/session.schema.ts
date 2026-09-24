// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import { z } from 'zod';

export const provideJitsiLinkSchema = z.object({
  body: z.object({
    jitsiLinkUrl: z.string().url(),
  }),
});
