import type { ServiceRegistry } from "./registry";
import { BattleService } from "./battle.service";
import { HuntService } from "./hunt.service";
import { LootService } from "./loot.service";
import { MarketService } from "./market.service";
import { TasksService } from "./tasks.service";
import { ToolsService } from "./tools.service";
import { PartyState } from "./states/party.state";
import { SessionState } from "./states/session.state";
import { HuntState } from "./states/hunt.state";
import { TrainingState } from "./states/training.state";
import { InventoryState } from "./states/inventory.state";
import { MarketState } from "./states/market.state";
import { TasksState } from "./states/tasks.state";

/** Register domain *State services then core automation services. */
export function registerDefaultServices(registry: ServiceRegistry): void {
  const ctx = registry.createContext();

  const party = new PartyState(ctx);
  const session = new SessionState(ctx, party);
  const hunt = new HuntState(ctx, session, party);
  const training = new TrainingState(ctx);
  const inventory = new InventoryState(ctx);
  const marketState = new MarketState(ctx);
  const tasksState = new TasksState(ctx, session);

  registry.registerDomain(party);
  registry.registerDomain(session);
  registry.registerDomain(hunt);
  registry.registerDomain(training);
  registry.registerDomain(inventory);
  registry.registerDomain(marketState);
  registry.registerDomain(tasksState);

  const market = new MarketService(ctx, marketState, inventory, session, party, hunt);
  const battle = new BattleService(ctx, hunt, party, session);
  const huntSvc = new HuntService(ctx, hunt, party, session, battle);
  const loot = new LootService(ctx, inventory, marketState, hunt, party, session, market, battle);
  const tasks = new TasksService(ctx, tasksState, session, party, huntSvc, battle);
  const tools = new ToolsService(ctx, training, party, session);

  registry.register(market);
  registry.register(battle);
  registry.register(huntSvc);
  registry.register(loot);
  registry.register(tasks);
  registry.register(tools);
}
