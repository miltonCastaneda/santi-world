import { InMemoryWorldRepository } from "../../../src/persistence/inMemoryRepository";
import { describeRepositoryContract } from "./repositoryContract";

describeRepositoryContract("memoria", (deps) => new InMemoryWorldRepository(deps));
