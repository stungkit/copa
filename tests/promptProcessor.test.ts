import {processPromptFile} from '../src/promptProcessor';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {filterFiles} from "../src/filterFiles";

describe('Prompt Processor with Ignore Patterns', () => {
    let testDir: string;

    const cleanPath = (path: string) => path.replace(testDir + '/', '');

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-prompt-test-'));
        await fs.mkdir(path.join(testDir, 'subdir'));
        await fs.writeFile(path.join(testDir, 'file1.js'), 'console.log("Hello");');
        await fs.writeFile(path.join(testDir, 'file2.md'), '# Markdown');
        await fs.writeFile(path.join(testDir, 'subdir', 'file3.txt'), 'Nested file content');
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    test('processes a prompt file with single file reference', async () => {
        const promptContent = 'This is a test prompt.\n{{@file1.js}}\nEnd of prompt.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('This is a test prompt.');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('End of prompt.');
    });

    test('processes a prompt file with multiple file references', async () => {
        const promptContent = 'Files:\n{{@file1.js}}\n{{@file2.md}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('file2.md =====');
        expect(result.content).toContain('# Markdown');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with folder reference', async () => {
        const promptContent = 'Folder contents:\n{{@subdir}}\nEnd of folder.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Folder contents:');
        expect(result.content).toContain('===== subdir/file3.txt =====');
        expect(result.content).toContain('Nested file content');
        expect(result.content).toContain('End of folder.');
    });

    test('handles non-existent file references gracefully', async () => {
        const promptContent = 'Missing file:\n{{@nonexistent.txt}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const {content, warnings} = await processPromptFile(promptFile);

        expect(content).toContain('Missing file:');
        expect(content).not.toContain('===== nonexistent.txt =====');
        expect(content).toContain('End.');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Warning: Error reading');
        expect(warnings[0]).toContain('nonexistent.txt');
    });

    test('processes a prompt file with ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-*.md,-**/subdir/**}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('/file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).not.toContain('/file2.md =====');
        expect(result.content).not.toContain('# Markdown');
        expect(result.content).not.toContain('/subdir/file');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with multiple ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-*.md,-*.yml,-**/subdir/file4.js}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).not.toContain('file2.md =====');
        expect(result.content).not.toContain('# Markdown');
        expect(result.content).not.toContain('file3.yml =====');
        expect(result.content).not.toContain('key: value');
        expect(result.content).not.toContain('===== subdir/file4.js =====');
        expect(result.content).not.toContain('===== subdir/file5.md ====='); // Changed this line
        expect(result.content).not.toContain('## Subheading');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with wildcard ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-*dir/*,-*.y*}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('file2.md =====');
        expect(result.content).toContain('# Markdown');
        expect(result.content).not.toContain('file3.yml =====');
        expect(result.content).not.toContain('key: value');
        expect(result.content).not.toContain('===== subdir/');
        expect(result.content).toContain('End.');
    });

    test('handles empty directories', async () => {
        await fs.mkdir(path.join(testDir, 'emptyDir'));
        const files = await filterFiles({}, testDir, testDir);
        expect(files).not.toContain('emptyDir');
    });

    test('handles files with special characters', async () => {
        await fs.writeFile(path.join(testDir, 'file-with-dashes.js'), 'content');
        await fs.writeFile(path.join(testDir, 'file with spaces.js'), 'content');
        await fs.writeFile(path.join(testDir, 'file_with_underscores.js'), 'content');
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('file-with-dashes.js');
        expect(files).toContain('file with spaces.js');
        expect(files).toContain('file_with_underscores.js');
    });

    test('handles very long file paths', async () => {
        const longPath = 'a'.repeat(200);
        await fs.mkdir(path.join(testDir, longPath), {recursive: true});
        await fs.writeFile(path.join(testDir, longPath, 'longfile.js'), 'content');
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain(path.join(longPath, 'longfile.js'));
    });

    test('handles case sensitivity in file extensions', async () => {
        await fs.writeFile(path.join(testDir, 'upper.JS'), 'content');
        await fs.writeFile(path.join(testDir, 'mixed.Js'), 'content');
        const files = (await filterFiles({exclude: 'js'}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('upper.JS');
        expect(files).toContain('mixed.Js');
    });

    test('handles multiple exclusion patterns', async () => {
        const files = await filterFiles({exclude: '.js,**/subdir/**.txt'}, testDir, testDir);
        expect(files?.length).toBe(1);
        expect(files?.map(cleanPath).sort()).toEqual(['file2.md'].sort());
    });

    test('handles symlinks', async () => {
        await fs.symlink(path.join(testDir, 'file1.js'), path.join(testDir, 'symlink.js'));
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('symlink.js');
    });

    test('excludes files by full path', async () => {
        const files = (await filterFiles({exclude: 'subdir/file4.js'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain(path.join('subdir', 'file4.js'));
        expect(files).toContain(path.join('subdir', 'file3.txt'));
    });

    test('handles nested exclusions', async () => {
        await fs.mkdir(path.join(testDir, 'nested', 'dir'), {recursive: true});
        await fs.writeFile(path.join(testDir, 'nested', 'file.js'), 'content');
        await fs.writeFile(path.join(testDir, 'nested', 'dir', 'file.js'), 'content');
        const files = (await filterFiles({exclude: '**/nested/*.js'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain(path.join('nested', 'file.js'));
        expect(files).toContain(path.join('nested', 'dir', 'file.js'));
    });

    test('excludes all files of a type regardless of location', async () => {
        const files = (await filterFiles({exclude: '**/*.md'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain('file2.md');
        expect(files).not.toContain(path.join('subdir', 'file5.md'));
    });

    test('excludes hidden folder and its files with glob pattern', async () => {
        const files = (await filterFiles({exclude: '.*'}, testDir, testDir))!.map(cleanPath);
        expect(files?.length).toBe(3);
        expect(files?.sort()).toEqual([
            'file1.js',
            'file2.md',
            path.join('subdir', 'file3.txt')
        ].sort());
    });

});

