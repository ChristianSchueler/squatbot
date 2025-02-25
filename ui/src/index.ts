// Google Media Pipe Face Detection Test using Typescript, (c) 2023 Christian Schüler, christianschueler.at

import { Detection, FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision"
import { ScaleToFitWindow } from "./ScaleToFitWindow.js";
import { io, Socket } from "socket.io-client";
import * as SocketIOInterfaces from './SocketIOInterfaces.js';

const debug = false;

console.log("SquatBot: creating socket.io client...");
const socket: Socket<
  SocketIOInterfaces.ServerToClientEvents, 
  SocketIOInterfaces.ClientToServerEvents> = io({autoConnect: true});

socket.on("connect", () => {
  console.log("SquatBot: socket.io connect.");

  // console.log("SquatBot: emit gameWon...");
  // socket.emit("gameWon");
});

socket.on("setConfig", (config: SocketIOInterfaces.SquatBotConfig) => { 
  console.log("SquatBot: socket.io setConfig", config);

  app.squatBot.setConfig(config);
});

enum Direction { up, down };
interface Face { x: number, y: number, valid: boolean };
enum Position { top, middle, bottom };    // squat position

/** @class SquatBot */
export class SquatBot {
  // CONFIG. possibly TODO: move to .env
  // readonly targetSquats: number = 3;
  // readonly gameWinTimeout_s: number = 10;          // how long until the next game might start
  // readonly faceMinX: number = 100;                 // only use faces in the center region
  // readonly faceMaxX: number = 640-100;             // only use faces in the center region
  // readonly gameStartTimeout_s: number = 3;         // how long to see a face for starting a game
  // readonly topOffset_px: number = 20;
  // readonly bottomOffset_px: number = 0;
  // readonly gameLeftTimeout_s: number = 3;          // cancel the game after 3 consecutive seconds without a face detected
  // readonly squatFactor: number = 1.2;
  config: SocketIOInterfaces.SquatBotConfig = new SocketIOInterfaces.SquatBotConfig;

  // game state
  squats: number = 0;                     // counting the number of squats
  lastFaceTime: number = Date.now();      // last time when a face has been detected
  lastWinTime: number = 0;                // last time the user won
  topY: number = 0;                       // upper limit the face has to reach to count as finished squat
  bottomY: number = 0;                    // lower limit the face has to reach to count as finished squat
  gameRunning: boolean = false;
  direction: Direction = Direction.down;  // current squat direction, used to counting valid squats
  startTime: number = Date.now();         // time the game started
  cocktailUnlocked: boolean = false;      // true, after won gamef, ready to pour a cocktail
  socket: Socket<SocketIOInterfaces.ServerToClientEvents, SocketIOInterfaces.ClientToServerEvents>;

  constructor(socket: Socket<
    SocketIOInterfaces.ServerToClientEvents, 
    SocketIOInterfaces.ClientToServerEvents>) {
    
      console.log("SquatBot: contructor");
      this.socket = socket;
  }

  // explicitely set config values
  setConfig(config: SocketIOInterfaces.SquatBotConfig) {
    this.config = {...config};    // do a copy
  }

  // find single valid face
  extractFace(d: Detection[]): Face {

    let face = { x: -1, y: -1, valid: false };

    // no detections, no valid face
    if (d == undefined || d.length == 0) return face;

    let found = false;
    let index = 0;
    do {

      let bb = d[index].boundingBox;
      if (bb) {
        face.x = bb.originX + bb.width/2;     // find center of face
        face.y = bb.originY + bb.height/2;

        // TODO: check for left and right margin
        found = true;
      }
      else index++;
  
    } while (!found && index < d.length);

    if (found) face.valid = true;

    return face;
  }

  // return position of the player during squatting
  computePosition(face: Face): Position | undefined {

    if (!face.valid) return undefined;

    if (face.y < this.topY) return Position.top;
    else if (face.y > this.bottomY) return Position.bottom;
    else return Position.middle;
  }

  analyzeFaces(d: Detection[]) {

    // find single valid face
    let face = this.extractFace(d);

    if (debug)
    {
       if (face.valid) console.log("face valid");
       else console.log("face invalid", face.x, face.y);
    }
    
    // update time we last saw a valid face
    if (face.valid) this.lastFaceTime = Date.now();

    // if recently won a game -> exit (game paused)
    if (this.cocktailUnlocked) {
      if (Date.now() - this.lastWinTime <= this.config.gameWinTimeout_s*1000) return;     // exit when in timeout after winning a game

      // when we come here, timeout is over, so signal to lock buttons again
      this.cocktailUnlocked = false;
    }

    if (this.gameRunning) {

      // if the player left, abort the game
      if (Date.now() - this.lastFaceTime > this.config.gameLeftTimeout_s*1000) { this.gameRunning = false; this.socket.emit("gameCancelled"); console.log("SquatBot: game cancelled"); return; }

      // get current squat position and possibly count up
      let position = this.computePosition(face);
      if (position == Position.bottom && this.direction == Direction.down) { this.direction = Direction.up; socket.emit("squatDown"); console.log("SquatBot: squat down"); }  // change direction when down
      else if (position == Position.top && this.direction == Direction.up) { this.squats++; this.direction = Direction.down; socket.emit("squatUp"); console.log("SquatBot: squat up. #squats:", this.squats);} // successfully completed a squat at the top 
    
      // game won!
      if (this.squats == this.config.targetSquats) { 
        this.cocktailUnlocked = true; 
        this.gameRunning = false; 
        this.lastWinTime = Date.now(); 
        this.socket.emit("gameWon");    // tell the server to unlock the cocktail buttons
        console.log("SquatBot: game won. Cocktail unlocked."); 
      }
    }
    else {

      // immediately exit when no game running and no face recognized
      if (!face.valid) { this.startTime = Date.now(); return; }

      // immediately exit when start duration not yet reached
      if (Date.now() - this.startTime <= this.config.gameStartTimeout_s*1000) return;

      this.startGame(face);
    }
  }

  startGame (face: Face) {
    console.log("SquatBot: start game");

    this.squats = 0;
    this.lastFaceTime = Date.now();
    this.topY = face.y + this.config.topOffset_px;
    this.bottomY = Math.min(face.y * this.config.squatFactor - this.config.bottomOffset_px, 400);
    this.direction = Direction.down;
    this.gameRunning = true;
    this.cocktailUnlocked = false;
    this.socket.emit("gameStarted");

    console.log("SquatBot: topY=", this.topY);
    console.log("SquatBot: bottomY=", this.bottomY); 
  }
}

/** @class Application */
export class Application {
  lastVideoTime = -1;
  video?: HTMLVideoElement;
  faceDetector?: FaceDetector;
  squatBot: SquatBot = new SquatBot(socket);

  constructor() {
    console.log("Google Media Pipe Face Detection Test using Typescript, (c) 2023 Christian Schüler, christianschueler.at");

    new ScaleToFitWindow("#screen"); 
  }

  async setup(): Promise<void> {

    if (!('mediaDevices' in navigator)) return;
    if (!('getUserMedia' in navigator.mediaDevices)) return;

    console.log("media api: go");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        // width: {
          // min: 1280,
          // ideal: 1920,
          // max: 2560,
        // },
        // height: {
          // min: 720,
          // ideal: 1080,
          // max: 1440
        // },
        // facingMode: 'user'
      }
    });

    console.log("camera activated", stream);

    this.video = document.getElementById("video") as HTMLVideoElement;
    this.video.srcObject = stream;
    console.log("Video: ", this.video.videoWidth, this.video.videoHeight);

    console.log("video running", this.video);

    console.log("getting media pipe vision tasks...");
    // https://snyk.io/advisor/npm-package/@mediapipe/tasks-vision
    /*const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );*/

    console.log("creating media pipe face detector...");
    const vision = await FilesetResolver.forVisionTasks("wasm");

    /*this.faceDetector = await FaceDetector.createFromModelPath(vision,
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
    );*/

    this.faceDetector = await FaceDetector.createFromModelPath(vision, "models/blaze_face_short_range.tflite");

    console.log("mediapipe loaded");

    await this.faceDetector.setOptions({ runningMode: "VIDEO" });

    console.log("face detector created");
  }

  // analyse
  run(): void {

    if (this.video?.currentTime !== this.lastVideoTime) {
      const d = this.faceDetector?.detectForVideo(this.video!, this.lastVideoTime);

      if (debug) console.log("face detection finished");
      
      if (d && d.detections) {
        this.squatBot.analyzeFaces(d.detections);
      }
      else {
        if (debug) console.log("no faces found");
      }
      
      //console.log(detections);
      if (d && d.detections && d.detections.length > 0) {
        let bb = d.detections[0].boundingBox;
        if (bb) {
          let centerX = bb.originX + bb.width / 2;
          let centerY = bb.originY + bb.height / 2;
          if (debug) console.log(centerX, centerY);
        }
      }
      if (this.video) this.lastVideoTime = this.video.currentTime;
    }

    requestAnimationFrame(() => {
      this.run();
    });
  }
}

// go!
const app = new Application();
await app.setup();
app.run();
