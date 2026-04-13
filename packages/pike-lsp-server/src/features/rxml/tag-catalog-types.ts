/**
 * RXML Tag types shared across catalog modules
 */

export type RXMLTagType = 'simple' | 'container';

export interface RXMLAttribute {
  name: string;
  type: string;
  required: boolean;
  description: string;
  values?: string[];
}

export interface RXMLTag {
  name: string;
  type: RXMLTagType;
  description: string;
  attributes: RXMLAttribute[];
  deprecated?: boolean;
}
