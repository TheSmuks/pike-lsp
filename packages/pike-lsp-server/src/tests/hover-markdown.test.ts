
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertPikeDocToMarkdown, buildHoverContent } from '../features/utils/hover-builder.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

describe('Hover Markdown Conversion', () => {
    it('should convert bold tag @b{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('This is @b{bold@} text'), 'This is **bold** text');
        assert.equal(convertPikeDocToMarkdown('@b{Bold@} at start'), '**Bold** at start');
        assert.equal(convertPikeDocToMarkdown('At end @b{bold@}'), 'At end **bold**');
    });

    it('should convert italic tag @i{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('This is @i{italic@} text'), 'This is *italic* text');
    });

    it('should convert tt/code tag @tt{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('Use @tt{int@} type'), 'Use `int` type');
        assert.equal(convertPikeDocToMarkdown('Use @code{int@} type'), 'Use `int` type');
    });

    it('should convert expr tag @expr{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('Use @expr{1+1@}'), 'Use `1+1`');
    });

    it('should convert url tag @url{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('See @url{http://pike.lysator.liu.se@}'), 'See <http://pike.lysator.liu.se>');
    });

    it('should convert rfc tag @rfc{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('See @rfc{1234@}'), 'See [RFC 1234](https://tools.ietf.org/html/rfc1234)');
    });

    it('should convert ref tag @ref{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('See @ref{Stdio.File@}'), 'See `Stdio.File`');
    });

    it('should convert shorthand ref @[...] ', () => {
        assert.equal(convertPikeDocToMarkdown('See @[Stdio.File] class'), 'See `Stdio.File` class');
    });

    it('should convert xml tag @xml{...@} by stripping tag', () => {
        assert.equal(convertPikeDocToMarkdown('Raw @xml{<tag>@} content'), 'Raw <tag> content');
    });

    it('should handle nested tags', () => {
        assert.equal(convertPikeDocToMarkdown('@b{Bold @i{and italic@}@}'), '**Bold *and italic***');
    });

    it('should handle escaped @', () => {
        assert.equal(convertPikeDocToMarkdown('Email: user@@example.com'), 'Email: user@example.com');
    });

    it('should handle unclosed tags gracefully', () => {
        // Current implementation reconstructs unclosed tags
        assert.equal(convertPikeDocToMarkdown('Unclosed @b{bold'), 'Unclosed @b{bold');
        assert.equal(convertPikeDocToMarkdown('Unclosed @[ref'), 'Unclosed @[ref');
    });

    it('should handle unknown tags by keeping content', () => {
        assert.equal(convertPikeDocToMarkdown('Unknown @unknown{tag@}'), 'Unknown tag');
    });

    it('should convert pre tag @pre{...@}', () => {
        const result = convertPikeDocToMarkdown('Code: @pre{line 1\nline 2@} text');
        assert.ok(result.includes('```'));
        assert.ok(result.includes('line 1'));
        assert.ok(result.includes('line 2'));
    });

    it('should convert u tag @u{...@} to HTML underline', () => {
        assert.equal(convertPikeDocToMarkdown('@u{underlined@} text'), '<u>underlined</u> text');
    });

    it('should convert sub tag @sub{...@} to HTML subscript', () => {
        assert.equal(convertPikeDocToMarkdown('H@sub{2@}O'), 'H<sub>2</sub>O');
    });

    it('should convert sup tag @sup{...@} to HTML superscript', () => {
        assert.equal(convertPikeDocToMarkdown('E=mc@sup{2@}'), 'E=mc<sup>2</sup>');
    });

    it('should convert image tag @image{...@}', () => {
        assert.equal(convertPikeDocToMarkdown('@image{path/to/img.png@}'), '[Image: path/to/img.png]');
    });
});

describe('Build Hover Content with Markup', () => {
    it('should format documentation with markup', () => {
        const symbol = {
            name: 'test',
            kind: 'method',
            documentation: {
                text: 'This is @b{bold@}.',
                params: {
                    x: 'A @tt{int@} value.'
                },
                returns: 'Returns @[void].'
            }
        } as unknown as PikeSymbol;

        const content = buildHoverContent(symbol);

        assert.ok(content?.includes('This is **bold**.'));
        assert.ok(content?.includes('A `int` value.'));
        assert.ok(content?.includes('**Returns:** Returns `void`.')); // Returns section includes formatted text
    });
});
