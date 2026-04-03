/**
 * RXML AST Parser - Token-based RXML parsing (no regex)
 * 
 * Replaces regex-based parsing with proper token-based AST construction.
 */

export interface RXMLPosition {
  line: number;
  character: number;
}

export interface RXMLRange {
  start: RXMLPosition;
  end: RXMLPosition;
}

// AST Node Types
export interface RXMLTextNode {
  type: 'text';
  content: string;
  range: RXMLRange;
}

export interface RXMLCommentNode {
  type: 'comment';
  content: string;
  range: RXMLRange;
}

export interface RXMLPikeCodeNode {
  type: 'pike-code';
  content: string;
  range: RXMLRange;
}

export interface RXMLAttribute {
  name: string;
  value: string;
  range: RXMLRange;
}

export interface RXMLTagNode {
  type: 'tag';
  name: string;
  attributes: RXMLAttribute[];
  children: RXMLNode[];
  range: RXMLRange;
  selfClosing: boolean;
}

export type RXMLNode = RXMLTextNode | RXMLCommentNode | RXMLPikeCodeNode | RXMLTagNode;

export interface RXMLDocument {
  nodes: RXMLNode[];
  range: RXMLRange;
}

/**
 * Simple token-based RXML parser
 * Uses character-by-character scanning instead of regex
 */
export class RXMLASTParser {
  parse(text: string): RXMLDocument {
    const nodes: RXMLNode[] = [];
    let pos = 0;
    let line = 0;
    let char = 0;

    const advance = (n: number) => {
      for (let i = 0; i < n && pos < text.length; i++) {
        if (text[pos] === '\n') {
          line++;
          char = 0;
        } else {
          char++;
        }
        pos++;
      }
    };

    const peek = (n: number) => text.substring(pos, Math.min(pos + n, text.length));

    const getPos = (): RXMLPosition => ({ line, character: char });

    while (pos < text.length) {
      // Check for comment <!--
      if (peek(4) === '<!--') {
        const startPos = getPos();
        advance(4);
        let content = '';
        while (pos < text.length && peek(3) !== '-->') {
          content += text[pos];
          advance(1);
        }
        advance(3); // skip -->
        nodes.push({
          type: 'comment',
          content: content.trim(),
          range: { start: startPos, end: getPos() }
        });
        continue;
      }

      // Check for pike code <pike>
      if (peek(6).toLowerCase() === '<pike>') {
        const startPos = getPos();
        advance(6);
        let content = '';
        while (pos < text.length && peek(7).toLowerCase() !== '</pike>') {
          content += text[pos];
          advance(1);
        }
        advance(7); // skip </pike>
        nodes.push({
          type: 'pike-code',
          content: content.trim(),
          range: { start: startPos, end: getPos() }
        });
        continue;
      }

      // Check for tags
      if (text[pos] === '<') {
        const startPos = getPos();
        advance(1); // skip <
        
        // Read tag name
        let tagName = '';
        while (pos < text.length && /[a-zA-Z0-9_:.-]/.test(text[pos])) {
          tagName += text[pos];
          advance(1);
        }

        if (!tagName) {
          // Not a valid tag, treat as text
          nodes.push({
            type: 'text',
            content: '<',
            range: { start: startPos, end: getPos() }
          });
          continue;
        }

        // Parse attributes
        const attributes: RXMLAttribute[] = [];
        while (pos < text.length && text[pos] !== '>' && text[pos] !== '/') {
          // Skip whitespace
          while (pos < text.length && /\s/.test(text[pos])) {
            advance(1);
          }

          if (text[pos] === '>' || text[pos] === '/') break;

          // Read attribute name
          let attrName = '';
          const attrStart = getPos();
          while (pos < text.length && /[a-zA-Z0-9_:.-]/.test(text[pos])) {
            attrName += text[pos];
            advance(1);
          }

          if (!attrName) {
            advance(1); // skip unknown char
            continue;
          }

          // Check for =value
          let attrValue = '';
          if (text[pos] === '=') {
            advance(1);
            const quote = text[pos];
            if (quote === '"' || quote === "'") {
              advance(1);
              while (pos < text.length && text[pos] !== quote) {
                attrValue += text[pos];
                advance(1);
              }
              advance(1); // skip closing quote
            }
          }

          attributes.push({
            name: attrName,
            value: attrValue,
            range: { start: attrStart, end: getPos() }
          });
        }

        // Check for self-closing />
        const selfClosing = text[pos] === '/' && peek(2) === '/>';
        if (selfClosing) {
          advance(2);
          nodes.push({
            type: 'tag',
            name: tagName,
            attributes,
            children: [],
            selfClosing: true,
            range: { start: startPos, end: getPos() }
          });
          continue;
        }

        // Regular tag - skip until >
        if (text[pos] === '>') {
          advance(1);
        }

        // For now, treat as self-closing (simplified)
        nodes.push({
          type: 'tag',
          name: tagName,
          attributes,
          children: [],
          selfClosing: false,
          range: { start: startPos, end: getPos() }
        });
        continue;
      }

      // Text content
      const textStart = getPos();
      let content = '';
      while (pos < text.length && text[pos] !== '<') {
        content += text[pos];
        advance(1);
      }
      if (content.length > 0) {
        nodes.push({
          type: 'text',
          content,
          range: { start: textStart, end: getPos() }
        });
      }
    }

    return {
      nodes,
      range: { start: { line: 0, character: 0 }, end: getPos() }
    };
  }
}
