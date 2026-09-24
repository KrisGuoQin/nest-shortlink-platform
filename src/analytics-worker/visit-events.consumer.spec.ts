import type { ShortLinkVisitedEventV1 } from '../messaging/events/short-link-visited.event.js';
import { VisitEventsConsumer } from './visit-events.consumer.js';

function createSubject() {
  const tx = {
    shortLinkVisit: {
      create: vi.fn().mockResolvedValue({}),
    },
    shortLink: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    ),
  };
  const metrics = {
    analyticsEventsTotal: { inc: vi.fn() },
  };
  const channel = {
    ack: vi.fn(),
    nack: vi.fn(),
  };
  const message = { content: Buffer.from('{}') };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  };
  const consumer = new VisitEventsConsumer(prisma as never, metrics as never);

  return { consumer, tx, metrics, channel, message, context };
}

function visitEvent(
  databaseVisitCountIncremented: boolean,
): ShortLinkVisitedEventV1 {
  return {
    eventId: 'event-1',
    shortLinkId: 'link-1',
    workspaceId: 'workspace-1',
    shortCode: 'abc12345',
    occurredAt: '2026-09-24T00:00:00.000Z',
    databaseVisitCountIncremented,
  };
}

describe('VisitEventsConsumer visit counting', () => {
  it('stores analytics without double-counting a max-limited visit', async () => {
    const { consumer, tx, metrics, channel, message, context } =
      createSubject();

    await consumer.handleVisited(visitEvent(true), context);

    expect(tx.shortLinkVisit.create).toHaveBeenCalledTimes(1);
    expect(tx.shortLink.updateMany).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(metrics.analyticsEventsTotal.inc).toHaveBeenCalledWith({
      result: 'processed',
    });
  });

  it('persists the visit count for an unlimited link', async () => {
    const { consumer, tx, channel, message, context } = createSubject();

    await consumer.handleVisited(visitEvent(false), context);

    expect(tx.shortLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { visitCount: { increment: 1 } },
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
  });
});
