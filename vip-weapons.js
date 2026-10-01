// Pozele armelor VVS din VIP Shop (01.10.2026).
// Fiecare armă din pachetul VVS Gunpack are o poză în assets/vip-weapons/
// (numele itemului din joc, cu litere mici, .webp) — pozele din inventarul
// serverului, mărite de 4 ori și curățate. Aici e lista: itemul din joc →
// [culoarea armei (pentru lumina din spatele pozei), numele afișat în joc].
// MRPWeapons.find(item, label) întoarce poza după numele itemului sau, dacă
// recompensa nu are itemul, după eticheta ei (ex. „Draco Gold VVS").
(() => {
  const W = {
  "WEAPON_300BOVVSGOLD": ["#ffc93c", "300 BLACKOUT GOLD VVS"],
  "WEAPON_AKV9": ["#ffe22d", "AKV9 VVS"],
  "WEAPON_AUGVVSBLACK": ["#aab3c2", "AUG BLACK VVS"],
  "WEAPON_AUGVVSBLUE": ["#3b6dff", "AUG BLUE VVS"],
  "WEAPON_AUGVVSBLUE2": ["#22d3ee", "AUG BLUE2 VVS"],
  "WEAPON_AUGVVSGOLD": ["#ffc93c", "AUG GOLD VVS"],
  "WEAPON_AUGVVSGREEN": ["#22c55e", "AUG GREEN VVS"],
  "WEAPON_AUGVVSORANGE": ["#ff8a1f", "AUG ORANGE VVS"],
  "WEAPON_AUGVVSPINK": ["#ff3dd4", "AUG PINK VVS"],
  "WEAPON_AUGVVSPLAT": ["#dfe6f0", "AUG PLATINUM VVS"],
  "WEAPON_AUGVVSPURPLE": ["#8b5cf6", "AUG PURPLE VVS"],
  "WEAPON_AUGVVSRED": ["#ef4444", "AUG RED VVS"],
  "WEAPON_AUGVVSROSE": ["#f2a6a0", "AUG ROSEGOLD VVS"],
  "WEAPON_BLACKARP": ["#aab3c2", "ARP BLACK"],
  "WEAPON_BLUE2ARP": ["#22d3ee", "ARP BLUE2 VVS"],
  "WEAPON_BLUEARP": ["#3b6dff", "ARP BLUE VVS"],
  "WEAPON_CX9_SMG": ["#ffe32d", "CX9 GOLD VVS"],
  "WEAPON_DEAGLEDRUM": ["#ffe22d", "DEAGLE DRUM GOLD VVS"],
  "WEAPON_DEAGLEDRUMBLACK": ["#aab3c2", "DEAGLE DRUM BLACK VVS"],
  "WEAPON_DEAGLEDRUMBLUE": ["#3b6dff", "DEAGLE DRUM BLUE VVS"],
  "WEAPON_DEAGLEDRUMBLUE2": ["#22d3ee", "DEAGLE DRUM BLUE2 VVS"],
  "WEAPON_DEAGLEDRUMGREEN": ["#22c55e", "DEAGLE DRUM GREEN VVS"],
  "WEAPON_DEAGLEDRUMORANGE": ["#ff8a1f", "DEAGLE DRUM ORANGE VVS"],
  "WEAPON_DEAGLEDRUMPINK": ["#ff3dd4", "DEAGLE DRUM PINK VVS"],
  "WEAPON_DEAGLEDRUMPLAT": ["#dfe6f0", "DEAGLE DRUM PLATINUM VVS"],
  "WEAPON_DEAGLEDRUMPURPLE": ["#8b5cf6", "DEAGLE DRUM PURPLE VVS"],
  "WEAPON_DEAGLEDRUMRED": ["#ef4444", "DEAGLE DRUM RED VVS"],
  "WEAPON_DEAGLEDRUMROSE": ["#f2a6a0", "DEAGLE DRUM ROSE VVS"],
  "WEAPON_DRACOVVSBLACK": ["#aab3c2", "DRACO BLACK VVS"],
  "WEAPON_DRACOVVSBLUE": ["#3b6dff", "DRACO BLUE VVS"],
  "WEAPON_DRACOVVSBLUE2": ["#22d3ee", "DRACO BLUE2 VVS"],
  "WEAPON_DRACOVVSGOLD": ["#ffc93c", "DRACO GOLD VVS"],
  "WEAPON_DRACOVVSGREEN": ["#22c55e", "DRACO GREEN VVS"],
  "WEAPON_DRACOVVSORANGE": ["#ff8a1f", "DRACO ORANGE VVS"],
  "WEAPON_DRACOVVSPINK": ["#ff3dd4", "DRACO PINK VVS"],
  "WEAPON_DRACOVVSPLAT": ["#dfe6f0", "DRACO PLATINUM VVS"],
  "WEAPON_DRACOVVSPURPLE": ["#8b5cf6", "DRACO PURPLE VVS"],
  "WEAPON_DRACOVVSRED": ["#ef4444", "DRACO RED VVS"],
  "WEAPON_DRACOVVSROSE": ["#f2a6a0", "DRACO ROSEGOLD VVS"],
  "WEAPON_G18BLACK": ["#aab3c2", "G18 BLACK VVS"],
  "WEAPON_G18BLUE": ["#3b6dff", "G18 BLUE VVS"],
  "WEAPON_G18BLUE2": ["#22d3ee", "G18 BLUE2 VVS"],
  "WEAPON_G18GREEN": ["#22c55e", "G18 GREEN VVS"],
  "WEAPON_G18ORANGE": ["#ff8a1f", "G18 ORANGE VVS"],
  "WEAPON_G18PINK": ["#ff3dd4", "G18 PINK VVS"],
  "WEAPON_G18PURPLE": ["#8b5cf6", "G18 PURPLE VVS"],
  "WEAPON_G18RED": ["#ef4444", "G18 VVS"],
  "WEAPON_G18_APPISTOL": ["#ffe32d", "G18 VVS"],
  "WEAPON_G26V2": ["#ffe32d", "G26 LASER VVS GOLD"],
  "WEAPON_G26VVSBLACK": ["#aab3c2", "G26 LASER VVS BLACK"],
  "WEAPON_G26VVSBLUE": ["#3b6dff", "G26 LASER VVS BLUE"],
  "WEAPON_G26VVSBLUE2": ["#22d3ee", "G26 LASER VVS BLUE2"],
  "WEAPON_G26VVSGREEN": ["#22c55e", "G26 LASER VVS GREEN"],
  "WEAPON_G26VVSORANGE": ["#ff8a1f", "G26 LASER VVS ORANGE"],
  "WEAPON_G26VVSPINK": ["#ff3dd4", "G26 LASER VVS PINK"],
  "WEAPON_G26VVSPURPLE": ["#8b5cf6", "G26 LASER VVS PURPLE"],
  "WEAPON_G26VVSRED": ["#ef4444", "G26 LASER VVS RED"],
  "WEAPON_G26VVSYELLOW": ["#ffd60a", "G26 LASER VVS YELLOW"],
  "WEAPON_GDRUMVVS": ["#ffe12d", "GSWITCH DRUM VVS"],
  "WEAPON_GREENARP": ["#22c55e", "ARP GREEN VVS"],
  "WEAPON_HAHA74U": ["#ffe22d", "AK74U VVS"],
  "WEAPON_HK33VVS": ["#ffe32d", "HK33 VVS"],
  "WEAPON_HK33VVSBLUE": ["#3b6dff", "HK33 ICED BLUE"],
  "WEAPON_HK33VVSBLUE2": ["#22d3ee", "HK33 ICED LIGHT BLUE"],
  "WEAPON_HK33VVSGREEN": ["#22c55e", "HK33 VVS GREEN"],
  "WEAPON_HK33VVSORANGE": ["#ff8a1f", "HK33 ICED ORANGE"],
  "WEAPON_HK33VVSPINK": ["#ff3dd4", "HK33 VVS PINK"],
  "WEAPON_HK33VVSPURPLE": ["#8b5cf6", "HK33 ICED PURPLE"],
  "WEAPON_HK33VVSRED": ["#ef4444", "HK33 RED VVS"],
  "WEAPON_JAK12": ["#ffe22d", "JAK12 VVS"],
  "WEAPON_M10": ["#ffe22d", "M10 VVS"],
  "WEAPON_MP5VVS": ["#ffe32d", "MP5 VVS"],
  "WEAPON_MP5VVSBLACK": ["#aab3c2", "MP5 BLACK VVS"],
  "WEAPON_MP5VVSBLUE": ["#3b6dff", "MP5 BLUE VVS"],
  "WEAPON_MP5VVSBLUE2": ["#22d3ee", "MP5 BLUE2 VVS"],
  "WEAPON_MP5VVSGREEN": ["#22c55e", "MP5 GREEN VVS"],
  "WEAPON_MP5VVSPINK": ["#ff3dd4", "MP5 PINK VVS"],
  "WEAPON_MP5VVSPURPLE": ["#8b5cf6", "MP5 PURPLE VVS"],
  "WEAPON_MP5VVSRED": ["#ef4444", "MP5 Red VVS"],
  "WEAPON_MPA": ["#ffe32d", "MPA GOLD VVS"],
  "WEAPON_MPXVVS": ["#ffe12d", "MPX GOLD VVS"],
  "WEAPON_ORANGEARP": ["#ff8a1f", "ARP ORANGE"],
  "WEAPON_PINKARP": ["#ff3dd4", "ARP PINK"],
  "WEAPON_PURPLEARP": ["#8b5cf6", "ARP PURPLE VVS"],
  "WEAPON_REDARP": ["#ef4444", "ARP RED VVS"],
  "WEAPON_RKVVS": ["#ffe22d", "RENETTI VVS"],
  "WEAPON_SCORPIONVVS": ["#ffe32d", "SCORPION VVS"],
  "WEAPON_SKELETONARP": ["#ffe22d", "ARP SKELETON VVS GOLD"],
  "WEAPON_SKELETONARPBLACK": ["#aab3c2", "ARP SKELETON VVS BLACK"],
  "WEAPON_SKELETONARPBLUE": ["#3b6dff", "ARP SKELETON VVS BLUE"],
  "WEAPON_SKELETONARPBLUE2": ["#22d3ee", "ARP SKELETON VVS BLUE2"],
  "WEAPON_SKELETONARPGREEN": ["#22c55e", "ARP SKELETON VVS GREEN"],
  "WEAPON_SKELETONARPORANGE": ["#ff8a1f", "ARP SKELETON VVS ORANGE"],
  "WEAPON_SKELETONARPPINK": ["#ff3dd4", "ARP SKELETON VVS PINK"],
  "WEAPON_SKELETONARPPURPLE": ["#8b5cf6", "ARP SKELETON VVS PURPLE"],
  "WEAPON_SKELETONARPRED": ["#ef4444", "ARP SKELETON VVS RED"],
  "WEAPON_SOS": ["#ffe32d", "PUMP VVS"],
  "WEAPON_SWITCHBLACK": ["#aab3c2", "G SWITCH BLACK VVS"],
  "WEAPON_SWITCHBLUE": ["#3b6dff", "G SWITCH BLUE VVS"],
  "WEAPON_SWITCHBLUE2": ["#22d3ee", "G SWITCH BLUE2 VVS"],
  "WEAPON_SWITCHCARTEL": ["#dfe6f0", "G SWITCH CARTEL VVS"],
  "WEAPON_SWITCHDRAGON": ["#ff2e2d", "G SWITCH DRAGON VVS"],
  "WEAPON_SWITCHGREEN": ["#22c55e", "G SWITCH GREEN VVS"],
  "WEAPON_SWITCHORANGE": ["#ff8a1f", "G SWITCH ORANGE VVS"],
  "WEAPON_SWITCHPURPLE": ["#8b5cf6", "G SWITCH PURPLE VVS"],
  "WEAPON_SWITCHRED": ["#ef4444", "G SWITCH RED VVS"],
  "WEAPON_SWITCHWHITE": ["#f1f5f9", "G SWITCH WHITE VVS"],
  "WEAPON_SWITCHYELLOW": ["#ffd60a", "G SWITCH YELLOW VVS"],
  "WEAPON_VELVVS": ["#ffe22d", "VEL VVS"],
  "WEAPON_YELLOWARP": ["#ffd60a", "ARP YELLOW VVS"]
  };
  const COLORS = ['BLACK', 'BLUE', 'BLUE2', 'GOLD', 'GREEN', 'ORANGE', 'PINK', 'PLATINUM', 'PLAT', 'PURPLE', 'RED', 'ROSE', 'ROSEGOLD', 'YELLOW', 'WHITE'];
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const tokens = s => norm(s).split(' ').filter(t => t && t !== 'VVS');
  const key = t => t.slice().sort().join(' ');
  // numele din joc, plus varianta cu „GOLD" pentru armele de bază fără culoare
  // în nume (ex. itemul WEAPON_MP5VVS = „MP5 VVS", dar în cutie scrie „MP5 Gold VVS")
  const byName = {};
  for (const k in W) {
    const t = tokens(W[k][1]);
    if (!(key(t) in byName)) byName[key(t)] = k;
    if (!t.some(x => COLORS.includes(x))) { const g = key(t.concat('GOLD')); if (!(g in byName)) byName[g] = k; }
  }
  const out = k => ({ item: k, src: 'assets/vip-weapons/' + k.toLowerCase() + '.webp', accent: W[k][0], name: W[k][1] });
  function find(item, label) {
    const k = String(item || '').toUpperCase().trim();
    if (W[k]) return out(k);
    if (k) return null;            // itemul e cunoscut, dar nu are poză — nu ghicim după etichetă
    const t = tokens(label);
    if (!t.length) return null;
    return byName[key(t)] ? out(byName[key(t)]) : null;
  }
  window.MRPWeapons = { find, all: () => Object.keys(W).map(out) };
})();
