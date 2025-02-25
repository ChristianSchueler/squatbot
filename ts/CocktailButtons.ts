// SquatBot Cocktail Mixing Bot (c) 2023-2024 by Christian Schüler, christianschueler.at

import { sleep } from './sleep.js';

import { Gpio } from './Gpio.js';
//import { Gpio } from 'onoff';

// either load onoff of a stub
// let moduleName = "onoff";
// if (process.platform == 'win32') moduleName = "./Gpio.js";		// for windows replace onoff with stub
// const { Gpio } = await import(moduleName);

// hardware buttons and LEDs
export class CocktailButtons {
    public enabled: boolean = false;        // enable / disable the buttons. disabling causes the onButtonX events to not be triggered
    public minHoldDuration_ms = 100;       // hold at least the duration to trigger a butten press. set to undefined to register any press
    public onButton1?: () => void;          // override this to enable the callback
    public onButton2?: () => void;          // override this to enable the callback
    
    button1: Gpio;     // hardware interfaces using raspi GPIO
    button2: Gpio;
    led1: Gpio;
    led2: Gpio;

    timer: Array<NodeJS.Timeout | undefined> = [];  // for blinking LEDs
    //buttonTimer: Array<NodeJS.Timeout | undefined> = [];  // for watching buttons
    //buttonPressed: Array<boolean | undefined> = [];       // for watching buttons, true if button is already pressed

    buttonPressedTime1: number = Date.now(); 
    buttonPressedTime2: number = Date.now(); 

    // initialize the hardware. param number are GPIO numbers
    constructor(gpioPinAlcButton: number, gpioPinNonAlcButton: number, led1: number, led2: number) {

        console.log("Setting up buttons...");
        
        this.button1 = new Gpio(gpioPinAlcButton, 'in', 'both', { debounceTimeout: 30 });
        this.button2 = new Gpio(gpioPinNonAlcButton, 'in', 'rising', { debounceTimeout: 30 });

        // set up long button press mechanics if we want long presses
        /*if (this.minHoldDuration_ms) {
            this.buttonPressed[1] = false;      // start unpressed of course
            this.buttonPressed[2] = false;
        }*/

        // ***** button 1 logic
        // TODO: refactor this to use an array for any number of buttons instead
        this.button1.watch((err, value) => {
            if (global.debug) {
                if (err) console.log("button1:", value, err); console.log("button1:", value);
            }

            if (!this.enabled) { 
		        if (global.debug) console.log("button 1 pressed, but not enabled. exiting."); 
		        return; 
	        }

            if (value == 1) {       // button pressed / down -> start press

                this.buttonPressedTime1 = Date.now();
            }
            else if (value == 0)    // button released / up -> end of press
            {
                let duration_ms = Date.now() - this.buttonPressedTime1;
                if (duration_ms < this.minHoldDuration_ms) {
                    if (global.debug) console.log("button 1: released too early. cancelling press.");
                    return;
                }

                if (global.debug) console.log("button 1: released too early. cancelling press.");

                console.log("button 1: pressed and released");
                if (this.onButton1) this.onButton1();       // execute event handler immediately
            }
            else console.log("fuck it!")

            /*
            // first time pressed and long press desired
            if (this.minHoldDuration_ms && !this.buttonPressed[1]) {
                
                if (global.debug) { console.log("button 1: long press started..."); }
                this.buttonTimer[1] = setTimeout(async () => {

                    if (global.debug) { console.log("button 1: long press triggered."); }

                    clearInterval(this.buttonTimer[1]);     // remove timer, so be sure
                    this.buttonTimer[1] = undefined;

                    this.buttonPressed[1] = true;           // remember we are pressing the button

                    if (this.onButton1) this.onButton1();    // execute event handler after long press

                }, this.minHoldDuration_ms);
            }
            else if (this.onButton1) this.onButton1();       // execute event handler immediately
            */
        });

        // ***** button 2 logic
        this.button2.watch((err, value) => {
            /*if (global.debug) {
                if (err) console.log("button2:", value, err); console.log("button2:", value);
            }

            if (!this.enabled) { 
		        console.log("button 2 pressed, but not enabled. exiting."); 
		        return;
	        }

            console.log("button 2 pressed.");
            if (this.onButton2) this.onButton2();       // execute event handler
            */

            if (global.debug) {
                if (err) console.log("button2:", value, err); console.log("button2:", value);
            }

            if (!this.enabled) { 
		        if (global.debug) console.log("button 2 pressed, but not enabled. exiting."); 
		        return; 
	        }

            if (value == 1) {       // button pressed / down -> start press

                this.buttonPressedTime2 = Date.now();
            }
            else if (value == 0)    // button released / up -> end of press
            {
                let duration_ms = Date.now() - this.buttonPressedTime2;
                if (duration_ms < this.minHoldDuration_ms) {
                    if (global.debug) console.log("button 2: released too early. cancelling press.");
                    return;
                }

                if (global.debug) console.log("button 2: released too early. cancelling press.");

                console.log("button 2: pressed and released");
                if (this.onButton2) this.onButton2();       // execute event handler immediately
            }
            else console.log("fuck it!")
        });

        this.led1 = new Gpio(led1, 'out');
        this.led2 = new Gpio(led2, 'out');
    }

    // all leds off
    async ledsOff() {
        console.log("All LEDs off");
        await this.led1.write(0);
        await this.led2.write(0);
    }

    // switch LED on, number: 1, 2
    async ledOn(led: number) {
        //console.log("LED #" + led + " on");
        switch (led) {
            case 1: await this.led1.write(1); break;
            case 2: await this.led2.write(1); break;
        }
    }

    // switch LED off, number: 1, 2
    async ledOff(led: number) {
        //console.log("LED #" + led + " off");
        switch (led) {
            case 1: await this.led1.write(0); break;
            case 2: await this.led2.write(0); break;
        }
    }

    // short on, then off
    async ledBlink(led: number, duration_ms: number = 300) {
        await this.ledOn(led);      // on
        await sleep(duration_ms);   // wait
        await this.ledOff(led);     // off
    }

    // continously blinking on, immeditely exits
    async ledBlinkContinuous(led: number, duration_ms: number = 300) {
        
        console.log("LED #" + led + " blink continous");

        this.timer[led] = setInterval(async () => {

            // TODO: refactor this to use this.ledBlink
            await this.ledOn(led);      // on
            await sleep(duration_ms);   // wait
            await this.ledOff(led);     // off

        }, duration_ms*2);
    }

    // stop continously blinking
    async ledBlinkStopContinuous(led: number) {

        console.log("LED #" + led + " blink continous STOP");

        if (this.timer[led]) {
            console.log("LED #" + led + " blink continous: timer cleared");

            clearInterval(this.timer[led]);
            this.timer[led] = undefined;
        }
    }
}
