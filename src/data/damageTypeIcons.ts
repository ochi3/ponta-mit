import dotIcon from "../assets/icons/dmg_type/dot.png";
import magicIcon from "../assets/icons/dmg_type/magical.png";
import physicalIcon from "../assets/icons/dmg_type/physical.png";
import uniqueIcon from "../assets/icons/dmg_type/unique.png";

export const DAMAGE_TYPE_ICONS = {
  dot: dotIcon,
  magic: magicIcon,
  physical: physicalIcon,
  unique: uniqueIcon,
};

export type DamageTypeIconKey = keyof typeof DAMAGE_TYPE_ICONS;

export const getDamageTypeIcon = (key?: DamageTypeIconKey) =>
  (key ? DAMAGE_TYPE_ICONS[key] : undefined);