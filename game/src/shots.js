export function setupShot(game, kind) {
    game.shotMode = true;
    game.shotFrames = 0;
    if (kind === 'start') {
        // Title screen over the living city: nothing to set up.
        return;
    }
    // Gameplay shots bypass newGame(), which is what normally unhides the
    // live HUD (boot leaves #hud-live display:none), so unhide it here.
    game.hud.setHudVisible(true);
    if (kind === 'play') {
        game.debugDrive = true;
        game.state = 'playing';
        game.hud.hideMenus();
        game.player.teleport(0, 120);
        game.player.heading = Math.PI;
        const v = game.spawnShotVehicle('solmarGT', 0, 120, Math.PI);
        game.shotEnterVehicle(v);
        game.player.cash = 1750;
        game.police.heat = 40;
        game.rig.yaw = Math.PI;
        game.rig.pitch = 0.3;
        game.rig.snapTo(game.player.pos);
        return;
    }
    if (kind === 'combat') {
        game.state = 'playing';
        game.hud.hideMenus();
        game.player.teleport(618, -158);
        game.player.heading = 2.46;
        game.combat.unlock('kestrel');
        game.combat.select('kestrel');
        game.player.setWeapon('kestrel');
        game.missions.startMission(0);
        game.skipCutscene();
        game.missions.debugJumpToStep(1);
        game.debugAim = true;
        game.rig.yaw = 2.46;
        game.rig.pitch = 0.22;
        game.rig.snapTo(game.player.pos);
        game.player.cash = 250;
        return;
    }
    if (kind === 'end') {
        game.state = 'playing';
        game.hud.hideMenus();
        game.missions.storyComplete = true;
        game.missions.discount = true;
        game.missions.current = 3;
        game.player.cash = 52000;
        game.player.health = 100;
        game.player.armor = 100;
        game.player.teleport(766, 246);
        game.player.heading = 2.2;
        game.spawnShotVehicle('solmarGT', 752, 252, 2.2);
        game.city.setTimeOfDay('sunset');
        game.rig.yaw = 2.2;
        game.rig.pitch = 0.28;
        game.rig.snapTo(game.player.pos);
        return;
    }
}
