#!/usr/bin/env node
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Context, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { createServer } from 'node:http';
import { serverConfig, storageLayerFromConfig } from './config.ts';
import { cacheRoutes } from './routes.ts';
import { CacheStorage } from './storage/cache-storage.ts';

const storage = storageLayerFromConfig.pipe(
  Layer.tap((context) => Effect.logInfo(`storage: ${Context.get(context, CacheStorage).name}`)),
);

const server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* serverConfig;
    return HttpRouter.serve(cacheRoutes(config), { disableLogger: true }).pipe(
      Layer.provide(storage),
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: config.host })),
    );
  }),
);

NodeRuntime.runMain(Layer.launch(server));
