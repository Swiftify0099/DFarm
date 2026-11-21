import React from 'react';
import Svg, {
  Path,
  Circle,
  Ellipse,
  Rect,
  G,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  SvgProps,
} from 'react-native-svg';

export interface DairyFarmIllustrationProps extends SvgProps {
  width?: number | string;
  height?: number;
}

export const DairyFarmIllustration: React.FC<DairyFarmIllustrationProps> = ({
  width = '100%',
  height = 210,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 375 210"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      {...props}
    >
      <Defs>
        {/* Sky Gradient */}
        <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FEECE0" />
          <Stop offset="65%" stopColor="#FFF2EA" />
          <Stop offset="100%" stopColor="#FDE4D2" />
        </LinearGradient>

        {/* Soft Cloud Gradient */}
        <LinearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.5} />
        </LinearGradient>

        {/* Far Hills Gradient */}
        <LinearGradient id="farHillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#C4DF88" />
          <Stop offset="100%" stopColor="#A4C962" />
        </LinearGradient>

        {/* Mid Hills Gradient */}
        <LinearGradient id="midHillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#96C844" />
          <Stop offset="100%" stopColor="#73A526" />
        </LinearGradient>

        {/* Main Foreground Pasture Gradient */}
        <LinearGradient id="foreHillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#7EBA2E" />
          <Stop offset="50%" stopColor="#679F1F" />
          <Stop offset="100%" stopColor="#4F8115" />
        </LinearGradient>

        {/* Silo Metallic Shading */}
        <LinearGradient id="siloGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#90A4AE" />
          <Stop offset="30%" stopColor="#ECEFF1" />
          <Stop offset="70%" stopColor="#CFD8DC" />
          <Stop offset="100%" stopColor="#78909C" />
        </LinearGradient>

        {/* Silo Dome Roof */}
        <LinearGradient id="siloDomeGrad" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0%" stopColor="#78909C" />
          <Stop offset="100%" stopColor="#B0BEC5" />
        </LinearGradient>

        {/* Farm Barn Roof */}
        <LinearGradient id="barnRoofGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#E65100" />
          <Stop offset="100%" stopColor="#BF360C" />
        </LinearGradient>

        {/* Milk Churn Metallic Gradient */}
        <LinearGradient id="milkCanBody" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#90A4AE" />
          <Stop offset="25%" stopColor="#ECEFF1" />
          <Stop offset="60%" stopColor="#CFD8DC" />
          <Stop offset="90%" stopColor="#B0BEC5" />
          <Stop offset="100%" stopColor="#78909C" />
        </LinearGradient>

        <LinearGradient id="milkCanNeck" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#78909C" />
          <Stop offset="35%" stopColor="#ECEFF1" />
          <Stop offset="100%" stopColor="#607D8B" />
        </LinearGradient>

        {/* Cow White Shading */}
        <LinearGradient id="cowBodyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="85%" stopColor="#F5F5F5" />
          <Stop offset="100%" stopColor="#E0E0E0" />
        </LinearGradient>
      </Defs>

      {/* 1. Sky Canvas */}
      <Rect x="0" y="0" width="375" height="210" fill="url(#skyGrad)" />

      {/* 2. Soft Background Clouds */}
      <G opacity={0.75}>
        {/* Left Cloud */}
        <Circle cx="60" cy="55" r="22" fill="url(#cloudGrad)" />
        <Circle cx="80" cy="50" r="26" fill="url(#cloudGrad)" />
        <Circle cx="102" cy="56" r="20" fill="url(#cloudGrad)" />
        <Rect x="55" y="55" width="55" height="18" fill="url(#cloudGrad)" />

        {/* Right Far Cloud */}
        <Circle cx="295" cy="48" r="24" fill="url(#cloudGrad)" />
        <Circle cx="320" cy="42" r="28" fill="url(#cloudGrad)" />
        <Circle cx="345" cy="50" r="20" fill="url(#cloudGrad)" />
        <Rect x="290" y="50" width="60" height="18" fill="url(#cloudGrad)" />
      </G>

      {/* 3. Distant Rolling Green Hills */}
      <Path
        d="M0 120 C80 95, 160 115, 240 100 C300 88, 350 98, 375 105 L375 210 L0 210 Z"
        fill="url(#farHillGrad)"
      />

      {/* 4. Background Farm Buildings & Silos (Right-Center) */}
      <G>
        {/* Silo 1 (Tall Left Silo) */}
        <Path d="M214 62 C214 55, 226 55, 226 62 Z" fill="url(#siloDomeGrad)" />
        <Rect x="214" y="62" width="12" height="38" rx="1" fill="url(#siloGrad)" />
        {/* Horizontal bands on silo */}
        <Path d="M214 72 H226 M214 82 H226 M214 92 H226" stroke="#78909C" strokeWidth="0.8" opacity={0.6} />

        {/* Silo 2 (Slightly Shorter Right Silo) */}
        <Path d="M228 66 C228 60, 239 60, 239 66 Z" fill="url(#siloDomeGrad)" />
        <Rect x="228" y="66" width="11" height="35" rx="1" fill="url(#siloGrad)" />
        <Path d="M228 75 H239 M228 85 H239 M228 94 H239" stroke="#78909C" strokeWidth="0.8" opacity={0.6} />

        {/* Farm Cottage / Dairy Barn */}
        {/* Wall */}
        <Rect x="242" y="78" width="30" height="20" rx="1" fill="#FFFFFF" />
        {/* Barn Roof */}
        <Path d="M239 78 L257 65 L275 78 Z" fill="url(#barnRoofGrad)" />
        {/* Windows and Door */}
        <Rect x="246" y="84" width="6" height="6" rx="0.5" fill="#3E2723" />
        <Rect x="259" y="85" width="7" height="13" rx="0.5" fill="#5D4037" />

        {/* Farm Trees behind and around barn */}
        <Circle cx="205" cy="95" r="14" fill="#558B2F" />
        <Circle cx="200" cy="90" r="10" fill="#689F38" />
        <Circle cx="278" cy="88" r="12" fill="#558B2F" />
        <Circle cx="288" cy="85" r="10" fill="#689F38" />
        <Circle cx="330" cy="95" r="16" fill="#4C8C2B" />
        <Circle cx="345" cy="98" r="13" fill="#689F38" />
      </G>

      {/* 5. Midground Pasture Hill */}
      <Path
        d="M0 135 C110 120, 210 130, 310 115 C345 110, 365 112, 375 115 L375 210 L0 210 Z"
        fill="url(#midHillGrad)"
      />

      {/* 6. Foreground Rolling Pasture Hill (Forms the main stage) */}
      <Path
        d="M-10 152 C70 136, 175 138, 275 144 C330 148, 365 156, 385 162 L385 220 L-10 220 Z"
        fill="url(#foreHillGrad)"
      />

      {/* Hilltop Specular / Sunlight Highlight Line */}
      <Path
        d="M-5 152 C70 136, 175 138, 275 144 C330 148, 365 156, 385 162"
        stroke="#AEEA00"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={0.45}
      />

      {/* Small bushes on the slopes */}
      <Circle cx="22" cy="154" r="8" fill="#3E6B1B" opacity={0.6} />
      <Circle cx="35" cy="152" r="6" fill="#4C8221" opacity={0.7} />
      <Circle cx="360" cy="162" r="9" fill="#3E6B1B" opacity={0.6} />

      {/* ---------------------------------------------------- */}
      {/* 7. THE HOLSTEIN DAIRY COW (Main character, Left-Center) */}
      {/* ---------------------------------------------------- */}
      <G id="holsteinCow">
        {/* Soft Ground Shadow beneath cow */}
        <Ellipse cx="118" cy="178" rx="68" ry="8" fill="#2E4A10" opacity={0.45} />

        {/* Far Back Leg (Left) */}
        <Path d="M72 136 L68 174 H74 L78 140 Z" fill="#D5D5D5" />
        <Rect x="68" y="172" width="6" height="3.5" rx="0.5" fill="#263238" />

        {/* Far Back Leg (Right) */}
        <Path d="M142 134 L138 173 H144 L148 138 Z" fill="#D5D5D5" />
        <Rect x="138" y="171" width="6" height="3.5" rx="0.5" fill="#263238" />

        {/* Cow Tail */}
        <Path
          d="M60 115 C56 128, 55 142, 58 152"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <Path
          d="M57 150 C55 154, 57 160, 60 162 C61 158, 60 152, 57 150 Z"
          fill="#1E1E1E"
        />

        {/* Udder (Soft Pink) */}
        <Path
          d="M82 136 C80 148, 98 148, 98 136 Z"
          fill="#FFCDD2"
        />
        <Circle cx="86" cy="147" r="1.5" fill="#F48FB1" />
        <Circle cx="93" cy="147" r="1.5" fill="#F48FB1" />

        {/* Main Body Torso */}
        <Path
          d="M62 108 C60 98, 72 95, 95 95 C125 95, 146 100, 154 108 C158 116, 155 136, 148 140 C136 145, 78 145, 66 138 C60 132, 60 118, 62 108 Z"
          fill="url(#cowBodyGrad)"
          stroke="#E0E0E0"
          strokeWidth="0.6"
        />

        {/* Black Patches on Body (Authentic Holstein pattern) */}
        {/* Large Back Flank Patch */}
        <Path
          d="M80 95 C90 95, 102 98, 106 108 C110 118, 98 128, 90 128 C82 128, 74 122, 75 112 C76 102, 72 95, 80 95 Z"
          fill="#1C1B1A"
        />
        {/* Hip Spot */}
        <Path
          d="M63 105 C68 102, 73 108, 72 116 C70 125, 62 128, 62 120 Z"
          fill="#1C1B1A"
        />
        {/* Shoulder / Neck Patch */}
        <Path
          d="M126 97 C138 97, 148 105, 146 116 C144 126, 134 130, 128 122 C124 116, 122 104, 126 97 Z"
          fill="#1C1B1A"
        />

        {/* Near Back Leg (Left) */}
        <Path
          d="M75 132 C74 140, 75 155, 77 176 H84 C85 160, 86 142, 85 132 Z"
          fill="url(#cowBodyGrad)"
        />
        {/* Black spot on near back leg */}
        <Path d="M76 144 C82 142, 85 146, 83 154 C78 156, 76 150, 76 144 Z" fill="#1C1B1A" />
        {/* Hoof */}
        <Rect x="77" y="174" width="7" height="4" rx="1" fill="#212121" />

        {/* Near Front Leg (Right) */}
        <Path
          d="M145 130 C146 142, 147 158, 148 176 H155 C156 160, 155 142, 153 130 Z"
          fill="url(#cowBodyGrad)"
        />
        {/* Black spot on near front knee */}
        <Path d="M147 142 C152 140, 154 145, 153 151 C149 152, 146 147, 147 142 Z" fill="#1C1B1A" />
        {/* Hoof */}
        <Rect x="148" y="174" width="7" height="4" rx="1" fill="#212121" />

        {/* Cow Neck */}
        <Path
          d="M146 102 C152 94, 160 90, 168 92 C172 98, 170 115, 158 122 C150 120, 145 110, 146 102 Z"
          fill="url(#cowBodyGrad)"
        />
        <Path d="M152 94 C158 92, 166 94, 163 104 C158 112, 150 108, 152 94 Z" fill="#1C1B1A" />

        {/* Cow Head Base */}
        <Path
          d="M166 84 C163 76, 185 74, 186 84 C188 94, 185 108, 178 114 C172 118, 164 116, 162 108 C160 98, 164 90, 166 84 Z"
          fill="url(#cowBodyGrad)"
          stroke="#E0E0E0"
          strokeWidth="0.5"
        />

        {/* Head Black Patch */}
        <Path
          d="M165 80 C172 76, 182 78, 184 86 C186 94, 178 96, 174 92 C170 88, 166 86, 165 80 Z"
          fill="#1C1B1A"
        />

        {/* Horns */}
        <Path d="M167 77 C164 70, 168 67, 170 71 Z" fill="#8D6E63" />
        <Path d="M182 77 C185 70, 181 67, 179 71 Z" fill="#8D6E63" />

        {/* Ears */}
        {/* Left Ear */}
        <Path d="M162 82 C154 80, 152 86, 161 88 Z" fill="#1C1B1A" />
        <Path d="M160 83 C156 82, 155 85, 160 86 Z" fill="#FFCDD2" />
        {/* Right Ear */}
        <Path d="M186 82 C194 80, 196 86, 187 88 Z" fill="#FFFFFF" />
        <Path d="M187 83 C192 82, 193 85, 188 86 Z" fill="#FFCDD2" />

        {/* Eyes with specular twinkle */}
        <Circle cx="169" cy="88" r="2.2" fill="#211B18" />
        <Circle cx="169.6" cy="87.4" r="0.8" fill="#FFFFFF" />

        <Circle cx="182" cy="88" r="2.2" fill="#211B18" />
        <Circle cx="182.6" cy="87.4" r="0.8" fill="#FFFFFF" />

        {/* Muzzle (Snout) */}
        <Path
          d="M168 98 C168 94, 182 94, 182 98 C184 104, 182 108, 175 108 C168 108, 166 104, 168 98 Z"
          fill="#FFCDD2"
          stroke="#F8BBD0"
          strokeWidth="0.8"
        />
        {/* Nostrils */}
        <Ellipse cx="172" cy="101" rx="1.3" ry="1" fill="#8D6E63" />
        <Ellipse cx="178" cy="101" rx="1.3" ry="1" fill="#8D6E63" />
        {/* Sweet Smile */}
        <Path d="M173 104 Q175 106 177 104" stroke="#8D6E63" strokeWidth="0.8" fill="none" />
      </G>

      {/* ---------------------------------------------------- */}
      {/* 8. THE CALF (Standing next to cow) */}
      {/* ---------------------------------------------------- */}
      <G id="holsteinCalf">
        {/* Ground Shadow */}
        <Ellipse cx="216" cy="174" rx="24" ry="5" fill="#2E4A10" opacity={0.4} />

        {/* Back Legs */}
        <Path d="M198 148 L196 172 H200 L202 150 Z" fill="#D5D5D5" />
        <Rect x="196" y="170" width="4.5" height="2.5" rx="0.5" fill="#263238" />

        {/* Front Legs */}
        <Path d="M228 148 L227 172 H231 L233 150 Z" fill="#D5D5D5" />
        <Rect x="227" y="170" width="4.5" height="2.5" rx="0.5" fill="#263238" />

        {/* Calf Body */}
        <Path
          d="M195 132 C194 126, 202 124, 215 124 C228 124, 234 128, 236 134 C238 140, 232 150, 226 151 C215 152, 198 152, 196 142 Z"
          fill="url(#cowBodyGrad)"
          stroke="#E0E0E0"
          strokeWidth="0.5"
        />

        {/* Spots on Calf */}
        <Path d="M204 124 C210 124, 214 128, 212 135 C208 140, 202 138, 203 130 Z" fill="#1C1B1A" />
        <Path d="M224 128 C230 126, 233 132, 230 138 C226 140, 222 136, 224 128 Z" fill="#1C1B1A" />

        {/* Near Back Leg */}
        <Path d="M201 146 L200 172 H205 L206 148 Z" fill="url(#cowBodyGrad)" />
        <Rect x="200" y="170" width="5" height="3" rx="0.5" fill="#212121" />

        {/* Near Front Leg */}
        <Path d="M226 146 L226 172 H231 L231 148 Z" fill="url(#cowBodyGrad)" />
        <Rect x="226" y="170" width="5" height="3" rx="0.5" fill="#212121" />

        {/* Calf Head */}
        <Path
          d="M232 118 C230 112, 244 110, 245 118 C246 125, 244 132, 238 136 C234 138, 230 136, 229 130 Z"
          fill="url(#cowBodyGrad)"
        />
        {/* Calf Spot */}
        <Path d="M232 116 C236 112, 242 114, 243 120 C240 124, 234 122, 232 116 Z" fill="#1C1B1A" />

        {/* Calf Ears */}
        <Path d="M229 116 C224 114, 224 118, 229 120 Z" fill="#1C1B1A" />
        <Path d="M246 116 C250 114, 250 118, 246 120 Z" fill="#FFCDD2" />

        {/* Calf Eye */}
        <Circle cx="235" cy="122" r="1.6" fill="#211B18" />
        <Circle cx="235.4" cy="121.5" r="0.6" fill="#FFFFFF" />

        {/* Calf Snout */}
        <Path
          d="M233 128 C233 125, 242 125, 242 128 C243 132, 242 134, 237 134 C233 134, 232 132, 233 128 Z"
          fill="#FFCDD2"
        />
        <Circle cx="235" cy="129.5" r="0.7" fill="#8D6E63" />
        <Circle cx="239" cy="129.5" r="0.7" fill="#8D6E63" />
      </G>

      {/* ---------------------------------------------------- */}
      {/* 9. STAINLESS STEEL MILK CAN / CHURN (Right of Cow) */}
      {/* ---------------------------------------------------- */}
      <G id="milkCanister">
        {/* Ground Shadow */}
        <Ellipse cx="285" cy="176" rx="22" ry="5.5" fill="#2E4A10" opacity={0.45} />

        {/* Milk Churn Lower Base Rim */}
        <Rect x="268" y="167" width="34" height="6" rx="3" fill="#78909C" />

        {/* Main Cylindrical Body */}
        <Rect x="269" y="136" width="32" height="32" rx="2" fill="url(#milkCanBody)" />

        {/* Specular White Shine Strip down front */}
        <Rect x="277" y="136" width="3.5" height="32" fill="#FFFFFF" opacity={0.5} />

        {/* Conical Shoulder / Taper */}
        <Path
          d="M269 136 L273 118 H297 L301 136 Z"
          fill="url(#milkCanNeck)"
        />
        {/* Shoulder Highlight */}
        <Path
          d="M278 136 L280 118 H284 L282 136 Z"
          fill="#FFFFFF"
          opacity={0.45}
        />

        {/* Neck Rim */}
        <Rect x="273" y="114" width="24" height="5" rx="1.5" fill="url(#milkCanBody)" />

        {/* Lid Base */}
        <Rect x="271" y="110" width="28" height="5" rx="2" fill="url(#milkCanBody)" />

        {/* Lid Top Handle Loop */}
        <Path
          d="M280 110 C280 104, 290 104, 290 110"
          stroke="#78909C"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Side Carrying Handles */}
        {/* Left Handle */}
        <Path
          d="M269 130 C263 130, 263 142, 269 142"
          stroke="#607D8B"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right Handle */}
        <Path
          d="M301 130 C307 130, 307 142, 301 142"
          stroke="#607D8B"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </G>

      {/* 10. Foreground Grass Blades / Flowers */}
      <Path d="M45 178 L47 170 M48 178 L52 171" stroke="#AEEA00" strokeWidth="1.2" strokeLinecap="round" />
      <Path d="M188 178 L191 171 M192 178 L196 172" stroke="#AEEA00" strokeWidth="1.2" strokeLinecap="round" />
      <Path d="M315 175 L317 168 M318 175 L322 169" stroke="#AEEA00" strokeWidth="1.2" strokeLinecap="round" />
      {/* Tiny white daisies on the grass */}
      <Circle cx="105" cy="176" r="1.5" fill="#FFFFFF" />
      <Circle cx="105" cy="176" r="0.6" fill="#FDD835" />
      <Circle cx="255" cy="175" r="1.5" fill="#FFFFFF" />
      <Circle cx="255" cy="175" r="0.6" fill="#FDD835" />
    </Svg>
  );
};
