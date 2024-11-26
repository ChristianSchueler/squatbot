// SquatBot Cocktail Mixing Bot (c) 2023-2024 by Christian Schüler, christianschueler.at

// async sleep
// usage: await sleep(duration_ms);
export function sleep(duration_ms: number) {
	return new Promise(resolve => setTimeout(resolve, duration_ms));
}
