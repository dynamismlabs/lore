import { collectionsRouter } from './routers/collections';
import { commentsRouter } from './routers/comments';
import { connectionsRouter } from './routers/connections';
import { invitesRouter } from './routers/invites';
import { meRouter } from './routers/me';
import { mediaRouter } from './routers/media';
import { peopleRouter } from './routers/people';
import { reactionsRouter } from './routers/reactions';
import { storiesRouter } from './routers/stories';
import { router } from './trpc';

export const appRouter = router({
  me: meRouter,
  collections: collectionsRouter,
  invites: invitesRouter,
  stories: storiesRouter,
  media: mediaRouter,
  people: peopleRouter,
  comments: commentsRouter,
  reactions: reactionsRouter,
  connections: connectionsRouter,
});

export type AppRouter = typeof appRouter;
