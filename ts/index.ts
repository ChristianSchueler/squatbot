// SquatBot Cocktail Mixing Bot (c) 2023-2024 by Christian Schüler, christianschueler.at

// references
// - https://github.com/fivdi/onoff
//
//
//

import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import fs from 'fs';
import util from 'util';
import * as readline from 'readline';
import pkg from 'electron';
const { app, BrowserWindow } = pkg;
//import { app, BrowserWindow } from "electron";

import { KarlIsisServer } from "./KarlIsisServer.js";
import { CocktailDispenser } from './CocktailDispenser.js';
import { CocktailRecipe } from './CocktailRecipe.js';
import { CocktailButtons } from './CocktailButtons.js';
import { sleep } from './sleep.js';

// make debug a global variable
declare global {
	var debug: boolean;
}

// remember console for later use
const log_stdout = process.stdout;

// overload console.log
console.log = function(...d) {

	let today: Date = new Date();

	let output = util.format(...d) + '\n';

	let timeString = (today.getHours()+1).toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0') + ':' + today.getSeconds().toString().padStart(2, '0') + "." + today.getMilliseconds().toString().padStart(3, '0');
	let dateString = today.getFullYear().toString() + '-' + (today.getMonth()+1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');

	// TODO: uh-oh crashes when logs folder does not exist
  	fs.appendFileSync(process.cwd() + '/logs/console-' + dateString + '.log', timeString + " - " + output);
	log_stdout.write(output);
};

//if (process.env.NODE_ENV === 'production') {
// 	//const pluginName = await import('../js/plugin_name.js');
//}

function isElectron() {
    // Renderer process
    if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
        return true;
    }

    // Main process
    if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
        return true;
    }

    // Detect the user agent when the `nodeIntegration` option is set to true
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}

// main entry point
async function main() {

	console.log("SquatBot (c) 2023-2024 by Christian Schüler. Welcome.");
	console.log("Press Ctrl-C to exit.");

	dotenv.config();	// move ENV variables from .env into NodeJS environment

	// set to true or any other value to activate it. leave it out or set to false to deactivate it
	if (process.env.DEBUG) {
		if (process.env.DEBUG == "false") global.debug = false;
		else global.debug = true;
	}
	else global.debug = false;

	// used for storing the current recipe
	let recipe: CocktailRecipe;

	// set up hardware buttons and LEDs
	let buttons = new CocktailButtons(5, 6, 7, 8);
	buttons.enabled = false;		// disable buttons first

	await buttons.ledsOff();		// turn off the lights
	await buttons.ledOn(1);
	await buttons.ledOn(2);

	// set up dispenser hardware
	let cocktailDispenser = new CocktailDispenser();
	const ingredients = cocktailDispenser.getIngredientList();

	console.log("f1...f12 start/stop dispensing");
	console.log("Ctrl-c   quit");

	// ***** main loop starts here
	// set up keyboard debug and maintenace controls

	readline.emitKeypressEvents(process.stdin);
	if (process.stdin.setRawMode != undefined) process.stdin.setRawMode(true);

	process.stdin.on('keypress', async (key, data) => {
		// check for abort Ctrl-C
		if (data.ctrl && data.name === 'c') {
			console.log("Exiting SquatBot. Have a nice day, bye-bye.");
			process.exit();
		}
		
		if (global.debug) console.log('key pressed:', data.name);

		switch (data.name) {
			case "f1": cocktailDispenser.togglePump(0); break;
			case "f2": cocktailDispenser.togglePump(1); break;
			case "f3": cocktailDispenser.togglePump(2); break;
			case "f4": cocktailDispenser.togglePump(3); break;
			case "f5": cocktailDispenser.togglePump(4); break;
			case "f6": cocktailDispenser.togglePump(5); break;
			case "f7": cocktailDispenser.togglePump(6); break;
			case "f8": cocktailDispenser.togglePump(7); break;
			case "f9": cocktailDispenser.togglePump(8); break;
			case "f10": cocktailDispenser.togglePump(9); break;
			case "f11": cocktailDispenser.togglePump(10); break;
			case "f12": cocktailDispenser.togglePump(11); break;
		}
	});

	// ROBOEXOTICA
	buttons.enabled = false;
		
	// create the server, hosting the html app for the camera
	let s = new KarlIsisServer();
	await s.start();

	s.onGameStarted = async () => {
		buttons.ledBlink(1, 1000);		// game started - on both for s second
		buttons.ledBlink(2, 1000);
	}

	s.onGameCancelled = async () => {

		await buttons.ledsOff();		// game cancelled - switch off the lights
	}

	s.onGameWon = async () => {
		console.log("SquatBot: Yay! Game won! Buttons are now enabled.");

		await sleep(550);		// hacky... wait until led1 is again off

		// both led's on
		await buttons.ledOn(1);
		await buttons.ledOn(2);

		buttons.enabled = true;
	}

	s.onSquatDown = async () => {
		console.log("SquatBot: squat down");
		await buttons.ledBlink(2, 500);
	}

	s.onSquatUp = async () => {
		console.log("SquatBot: squat up");
		await buttons.ledBlink(1, 500);
	}

	// start electron app (i.e. window) only when using electron
	if (isElectron()) {
		
		// Quit when all windows are closed.
		app.on('window-all-closed', () => {
			// On macOS it is common for applications and their menu bar
			// to stay active until the user quits explicitly with Cmd + Q
			if (process.platform !== 'darwin') {
				app.quit()
			}
		})

		await app.whenReady();		// wait until electron window is open

		var mainWindow = new BrowserWindow({
			title: "Karl-Isis the 25001",
			show: false,
			//fullscreen: true,
			//kiosk: true,
			autoHideMenuBar: true
		});
		
		mainWindow.webContents.on("crashed", (e) => {
			app.relaunch();
			app.quit();
		});

		//mainWindow.maximize();
		mainWindow.webContents.openDevTools();
		console.log("opening URL: http://localhost:5000");
		mainWindow.loadURL("http://localhost:5000");
		mainWindow.show();
	}
}

// execute main function in async way and recover from error. main entry point.
(async () => {
	let running = true;

    while (running) {
		try {
			await main();
			//console.log("Exiting Karl-Isis the 25001. Have a nice day, bye-bye.");
			running = false;
		} catch (e) {
			console.error("error in main:", e);
			if (debug) running = false;		// if not in production mode, terminate immediately after first error. otherwise, continue into endless loop
			
			// by default -> restart using a loop in case of error to keep it running
		}
	}
})();
