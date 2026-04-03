/**
 * RXML AST Parser - Token-based RXML parsing (no regex)
 * 
 * Replaces regex-based parsing with proper token-based AST construction.
 * Handles: tags, attributes, Pike code regions, comments, text content
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

// Token types for lexical analysis
interface RXMLToken {
  type: 'text' | 'less-than' | 'greater-than' | 'slash' | 'equals' | 'quote' | 'whitespace' | 'identifier' | 'pike-start' | 'pike-end' | 'comment-start' | 'comment-end' | 'eof';
  value: string;
  position: RXMLPosition;
}

export class RXMLASTParser {
  private text: string = '';
  private position: number = 0;
  private line: number = 0;
  private character: number = 0;
  private tokens: RXMLToken[] = [];

  parse(text: string): RXMLDocument {
    this.text = text;
    this.position = 0;
    this.line = 0;
    this.character = 0;
    
    // Tokenize
    this.tokens = this.tokenize();
    
    // Parse into AST
    const nodes = this.parseNodes();
    
    return {
      nodes,
      range: {
        start: { line: 0, character: 0 },
        end: this.getEndPosition(),
      },
    };
  }

  private tokenize(): RXMLToken[] {
    const tokens: RXMLToken[] = [];
    
    while (this.position < this.text.length) {
      const char = this.text[this.position];
      const startPos = this.getCurrentPosition();
      
      // Check for Pike code regions: <pike> ... </pike>
      if (char === '<' && this.peekAhead(5).toLowerCase() === '<pike') {
        tokens.push(this.makeToken('pike-start', '<pike>', startPos));
        this.advance(5);
        continue;
      }
      
      // Check for comment start: <!--
      if (char === '<' && this.peekAhead(4) === '<!--') {
        tokens.push(this.makeToken('comment-start', '<!--', startPos));
        this.advance(4);
        continue;
      }
      
      // Check for comment end: -->
      if (char === '-' && this.peekAhead(3) === '-->') {
        tokens.push(this.makeToken('comment-end', '-->', startPos));
        this.advance(3);
        continue;
      }
      
      // Single character tokens
      switch (char) {
        case '<':
          tokens.push(this.makeToken('less-than', '<', startPos));
          this.advance(1);
          continue;
        case '>':
          tokens.push(this.makeToken('greater-than', '>', startPos));
          this.advance(1);
          continue;
        case '/':
          tokens.push(this.makeToken('slash', '/', startPos));
          this.advance(1);
          continue;
        case '=':
          tokens.push(this.makeToken('equals', '=', startPos));
          this.advance(1);
          continue;
        case '"':
        case "'":
          tokens.push(this.makeToken('quote', char, startPos));
          this.advance(1);
          continue;
      }
      
      // Whitespace
      if (/\s/.test(char)) {
        const whitespace = this.readWhile(/\s/);
        tokens.push(this.makeToken('whitespace', whitespace, startPos));
        continue;
      }
      
      // Identifier (tag name, attribute name)
      if (/[a-zA-Z_]/.test(char)) {
        const identifier = this.readWhile(/[a-zA-Z0-9_:.-]/);
        tokens.push(this.makeToken('identifier', identifier, startPos));
        continue;
      }
      
      // Text content (collect until we hit a special character)
      const text = this.readUntil(/[<\"']/);
      if (text.length > 0) {
        tokens.push(this.makeToken('text', text, startPos));
      } else {
        // Unknown character, skip it
        this.advance(1);
      }
    }
    
    tokens.push(this.makeToken('eof', '', this.getCurrentPosition()));
    return tokens;
  }

  private parseNodes(): RXMLNode[] {
    const nodes: RXMLNode[] = [];
    let i = 0;
    
    while (i < this.tokens.length && this.tokens[i].type !== 'eof') {
      const node = this.parseNode(i);
      if (node) {
        nodes.push(node.node);
        i = node.nextIndex;
      } else {
        i++;
      }
    }
    
    return nodes;
  }

  private parseNode(startIndex: number): { node: RXMLNode; nextIndex: number } | null {
    const token = this.tokens[startIndex];
    
    // Skip whitespace between nodes
    if (token.type === 'whitespace') {
      return this.parseNode(startIndex + 1);
    }
    
    // Pike code region
    if (token.type === 'pike-start') {
      return this.parsePikeCode(startIndex);
    }
    
    // Comment
    if (token.type === 'comment-start') {
      return this.parseComment(startIndex);
    }
    
    // Tag
    if (token.type === 'less-than') {
      return this.parseTag(startIndex);
    }
    
    // Text content
    if (token.type === 'text') {
      return {
        node: {
          type: 'text',
          content: token.value,
          range: { start: token.position, end: this.getTokenEnd(token) },
        },
        nextIndex: startIndex + 1,
      };
    }
    
    return null;
  }

  private parsePikeCode(startIndex: number): { node: RXMLPikeCodeNode; nextIndex: number } {
    const startToken = this.tokens[startIndex];
    let i = startIndex + 1;
    let content = '';
    const contentStart = this.getCurrentPosition();
    
    // Collect content until </pike>
    while (i < this.tokens.length) {
      const token = this.tokens[i];
      
      if (token.type === 'less-than' && this.peekToken(i + 1, 'slash')) {
        // Check for </pike>
        if (this.peekToken(i + 2, 'identifier') && 
            this.tokens[i + 2].value.toLowerCase() === 'pike' &&
            this.peekToken(i + 3, 'greater-than')) {
          // Found </pike>
          const endToken = this.tokens[i + 3];
          return {
            node: {
              type: 'pike-code',
              content: content.trim(),
              range: {
                start: startToken.position,
                end: this.getTokenEnd(endToken),
              },
            },
            nextIndex: i + 4,
          };
        }
      }
      
      content += token.value;
      i++;
    }
    
    // Unclosed pike tag - return what we have
    return {
      node: {
        type: 'pike-code',
        content: content.trim(),
        range: {
          start: startToken.position,
          end: this.getTokenEnd(this.tokens[i - 1] || startToken),
        },
      },
      nextIndex: i,
    };
  }

  private parseComment(startIndex: number): { node: RXMLCommentNode; nextIndex: number } {
    const startToken = this.tokens[startIndex];
    let i = startIndex + 1;
    let content = '';
    
    while (i < this.tokens.length) {
      const token = this.tokens[i];
      
      if (token.type === 'comment-end') {
        return {
          node: {
            type: 'comment',
            content: content.trim(),
            range: {
              start: startToken.position,
              end: this.getTokenEnd(token),
            },
          },
          nextIndex: i + 1,
        };
      }
      
      content += token.value;
      i++;
    }
    
    // Unclosed comment
    return {
      node: {
        type: 'comment',
        content: content.trim(),
        range: {
          start: startToken.position,
          end: this.getTokenEnd(this.tokens[i - 1] || startToken),
        },
      },
        nextIndex: i,
    };
  }

  private parseTag(startIndex: number): { node: RXMLTagNode; nextIndex: number } | null {
    const startToken = this.tokens[startIndex];
    let i = startIndex + 1;
    
    // Check for closing tag </name>
    if (this.peekToken(startIndex + 1, 'slash')) {
      // This is a closing tag - skip it (handled by parent)
      return null;
    }
    
    // Get tag name
    if (!this.peekToken(i, 'identifier')) {
      return null; // Invalid tag
    }
    
    const nameToken = this.tokens[i];
    const tagName = nameToken.value;
    i++;
    
    // Parse attributes
    const attributes: RXMLAttribute[] = [];
    while (i < this.tokens.length) {
      if (this.tokens[i].type === 'slash' || this.tokens[i].type === 'greater-than') {
        break;
      }
      
      if (this.tokens[i].type === 'identifier') {
        const attrName = this.tokens[i].value;
        const attrNameToken = this.tokens[i];
        i++;
        
        // Skip whitespace
        while (i < this.tokens.length && this.tokens[i].type === 'whitespace') {
          i++;
        }
        
        if (this.peekToken(i, 'equals')) {
          i++;
          
          // Skip whitespace
          while (i < this.tokens.length && this.tokens[i].type === 'whitespace') {
            i++;
          }
          
          if (this.peekToken(i, 'quote')) {
            i++;
            const valueStart = this.tokens[i]?.position || attrNameToken.position;
            let attrValue = '';
            
            while (i < this.tokens.length && !this.peekToken(i, 'quote')) {
              attrValue += this.tokens[i].value;
              i++;
            }
            
            if (this.peekToken(i, 'quote')) {
              i++;
            }
            
            attributes.push({
              name: attrName,
              value: attrValue,
              range: {
                start: attrNameToken.position,
                end: this.getTokenEnd(this.tokens[i - 1] || attrNameToken),
              },
            });
          }
        } else {
          // Attribute without value (boolean attribute)
          attributes.push({
            name: attrName,
            value: '',
            range: {
              start: attrNameToken.position,
              end: this.getTokenEnd(attrNameToken),
            },
          });
        }
      } else {
        i++;
      }
    }
    
    // Check for self-closing tag />
    const selfClosing = this.peekToken(i, 'slash') && this.peekToken(i + 1, 'greater-than');
    if (selfClosing) {
      const endToken = this.tokens[i + 1];
      return {
        node: {
          type: 'tag',
          name: tagName,
          attributes,
          children: [],
          selfClosing: true,
          range: {
            start: startToken.position,
            end: this.getTokenEnd(endToken),
          },
        },
        nextIndex: i + 2,
      };
    }
    
    // Regular tag - find closing >
    if (!this.peekToken(i, 'greater-than')) {
      return null; // Invalid tag
    }
    
    i++; // Skip >
    
    // Parse children until closing tag
    const children: RXMLNode[] = [];
    const contentStart = i;
    
    while (i < this.tokens.length) {
      // Check for closing tag </name>
      if (this.peekToken(i, 'less-than') && 
          this.peekToken(i + 1, 'slash') &&
          this.peekToken(i + 2, 'identifier') &&
          this.tokens[i + 2].value === tagName &&
          this.peekToken(i + 3, 'greater-than')) {
        const endToken = this.tokens[i + 3];
        return {
          node: {
            type: 'tag',
            name: tagName,
            attributes,
            children,
            selfClosing: false,
            range: {
              start: startToken.position,
              end: this.getTokenEnd(endToken),
            },
          },
          nextIndex: i + 4,
        };
      }
      
      const child = this.parseNode(i);
      if (child) {
        children.push(child.node);
        i = child.nextIndex;
      } else {
        i++;
      }
    }
    
    // Unclosed tag - return what we have
    return {
      node: {
        type: 'tag',
        name: tagName,
        attributes,
        children,
        selfClosing: false,
        range: {
          start: startToken.position,
          end: this.getTokenEnd(this.tokens[i - 1] || startToken),
        },
      },
      nextIndex: i,
    };
  }

  // Helper methods
  private getCurrentPosition(): RXMLPosition {
    return { line: this.line, character: this.character };
  }

  private getEndPosition(): RXMLPosition {
    const lines = this.text.split('\n');
    return {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    };
  }

  private makeToken(type: RXMLToken['type'], value: string, position: RXMLPosition): RXMLToken {
    return { type, value, position };
  }

  private getTokenEnd(token: RXMLToken): RXMLPosition {
    const lines = token.value.split('\n');
    if (lines.length === 1) {
      return {
        line: token.position.line,
        character: token.position.character + token.value.length,
      };
    } else {
      return {
        line: token.position.line + lines.length - 1,
        character: lines[lines.length - 1].length,
      };
    }
  }

  private advance(count: number): void {
    for (let i = 0; i < count && this.position < this.text.length; i++) {
      if (this.text[this.position] === '\n') {
        this.line++;
        this.character = 0;
      } else {
        this.character++;
      }
      this.position++;
    }
  }

  private peekAhead(count: number): string {
    return this.text.substring(this.position, Math.min(this.position + count, this.text.length));
  }

  private readWhile(pattern: RegExp): string {
    let result = '';
    while (this.position < this.text.length && pattern.test(this.text[this.position])) {
      result += this.text[this.position];
      this.advance(1);
    }
    return result;
  }

  private readUntil(pattern: RegExp): string {
    let result = '';
    while (this.position < this.text.length && !pattern.test(this.text[this.position])) {
      result += this.text[this.position];
      this.advance(1);
    }
    return result;
  }

  private peekToken(index: number, type: RXMLToken['type']): boolean {
    return index < this.tokens.length && this.tokens[index].type === type;
  }
}
