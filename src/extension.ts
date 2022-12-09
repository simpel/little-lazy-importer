// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {type TReplacement} from './types/TReplacements';

const ignoreList = new Set(['react', 'React', 'Suspense', 'lazy', 'react-dom']);

const nonDefaultImport = (module: string, path: string) => {
	if (!ignoreList.has(module)) {
		return `const ${module} = lazy(() => import(${path}).then(module => ({ default: module.${module} })));`;
	}
};

const defaultImport = (module: string, path: string) => {
	if (!ignoreList.has(module)) {
		return `const ${module} = lazy(async () => import(${path}));`;
	}
};

const generateNonDefaultReplacements = (module: string, path: string) => {
	const modules = [...module.matchAll(/\w+/gm)];

	const replacements: TReplacement['lazyStrings'] = [];

	for (const module of modules) {
		const lazyString = nonDefaultImport(module[0], path);
		if (lazyString) {
			replacements.push(lazyString);
		}
	}

	return replacements;
};

const convertImportToLazy = (importString: string): TReplacement[] => {
	const imports = /import\s([\S\s]*?)\sfrom/g.exec(importString)?.[1].trim();
	const path = /(?<=from\s)(.*)(?=;)/g.exec(importString)?.[1].trim();

	if (!imports || !path) {
		return [];
	}

	const moduleNames = [...imports.matchAll(/\b\w+\b|{[^}]+}/g)];

	const replacements: TReplacement[] = [];

	if (moduleNames) {
		const lazyStrings = [];
		for (const module of moduleNames) {
			if (module[0].includes('{')) {
				lazyStrings.push(...generateNonDefaultReplacements(module[0], path));
			} else {
				const lazyString = defaultImport(module[0], path);
				if (lazyString) {
					lazyStrings.push(lazyString);
				}
			}
		}

		if (lazyStrings.length > 0) {
			replacements.push({
				importString,
				lazyStrings,
			});
		}
	}

	return replacements;
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		'littlelazyimporter.convertToReactLazy',
		async () => {
			const editor = vscode.window.activeTextEditor;
			const document = editor?.document;

			if (!editor || !document) {
				await vscode.window.showErrorMessage(
					'Please open a document to convert to React.lazy',
				);
				return;
			}

			let content = document.getText();

			if (!content) {
				await vscode.window.showErrorMessage(
					'The file you are trying to convert is empty',
				);
				return;
			}

			const importRegEx = /import\s([\S\s]*?)\sfrom\s.*;/g;

			const replacements: TReplacement[] = [];

			for (const match of content.matchAll(importRegEx)) {
				const replacement = convertImportToLazy(match[0]);
				replacement.map((r) => replacements.push(r));
			}

			const pickableReplacements = replacements.map((r) => {
				return r.importString;
			});

			const pickedReplacements = await vscode.window.showQuickPick(
				pickableReplacements,
				{
					canPickMany: true,
					title: 'Select the imports you want to convert to React.lazy imports',
				},
			);

			if (!pickedReplacements) {
				await vscode.window.showErrorMessage(
					"You didn't select any imports to convert to React.lazy imports",
				);
				return;
			}

			const filteredReplacements = replacements.filter((r) =>
				pickedReplacements.includes(r.importString),
			);

			for (const replacement of filteredReplacements) {
				content = content.replace(
					replacement.importString,
					replacement.lazyStrings.join('\n'),
				);
			}

			if (!content.includes('import React')) {
				content = "import React from 'react';\n" + content;
			}

			await editor.edit((editBuilder) => {
				editBuilder.replace(
					new vscode.Range(
						new vscode.Position(0, 0),
						new vscode.Position(document.lineCount, 0),
					),
					content,
				);
			});
		},
	);

	context.subscriptions.push(disposable);
}
