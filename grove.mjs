#!/usr/bin/env node
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { diffLines } from "diff";
import chalk from "chalk";
import {Command} from "commander";

const program =new Command()

class Grove {
    constructor(repoPath = ".") {
        this.repoPath = path.join(repoPath, ".grove");
        this.objectPath = path.join(this.repoPath, "objects");
        this.headPath = path.join(this.repoPath, "HEAD");
        this.indexPath = path.join(this.repoPath, "index");
        this.init();
    }

    async init() {
        await fs.mkdir(this.objectPath, { recursive: true });
        try {
            await fs.writeFile(this.headPath, "", { flag: "wx" });
            await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
        } catch (error) {
            console.log("Already Initialized the .grove folder");
        }
    }

    hashObject(content) {
        return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
    }

    async add(fileToBeAdded) {
        const fileData = await fs.readFile(fileToBeAdded, { encoding: "utf-8" });
        const fileHash = this.hashObject(fileData);
        console.log(fileHash);
        const newFileHashedObjectPath = path.join(this.objectPath, fileHash);
        await fs.writeFile(newFileHashedObjectPath, fileData);
        await this.updateStagingArea(fileToBeAdded, fileHash);
        console.log(`Added ${fileToBeAdded}`);
    }

    async updateStagingArea(filePath, fileHash) {
        const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: 'utf-8' }));
        index.push({ path: filePath, hash: fileHash });
        await fs.writeFile(this.indexPath, JSON.stringify(index));
    }

    async commit(message) {
        const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: "utf-8" }));
        const parentCommit = await this.getCurrentHead();

        const commitData = {
            timeStamp: new Date().toISOString(),
            message,
            files: index,
            parentCommit: parentCommit
        };

        const commitHash = this.hashObject(JSON.stringify(commitData));
        const commitPath = path.join(this.objectPath, commitHash);
        await fs.writeFile(commitPath, JSON.stringify(commitData));
        await fs.writeFile(this.headPath, commitHash);
        await fs.writeFile(this.indexPath, JSON.stringify([]));
        console.log(`Commit Successfully Created: ${commitHash}`);
    }

    async getCurrentHead() {
        try {
            return await fs.readFile(this.headPath, { encoding: "utf-8" });
        } catch (error) {
            return null;
        }
    }

    async log() {
        let currentCommitHash = await this.getCurrentHead();
        while (currentCommitHash) {
            const commitData = JSON.parse(await fs.readFile(path.join(this.objectPath, currentCommitHash), { encoding: "utf-8" }));
            console.log("_________________________________________________________")
            console.log(`Commit: ${currentCommitHash}\nDate: ${commitData.timeStamp}\n\n${commitData.message}\n\n`);
            currentCommitHash = commitData.parentCommit;
        }
    }

    async showCommitDiff(commitHash) {
        const commitData = JSON.parse(await this.getCommitData(commitHash));
        if (!commitData) {
            console.log("Commit not found");
            return;
        }

        console.log("Changes in the last commit are:");
        for (const file of commitData.files) {
            console.log(`File: ${file.path}`);
            const fileContent = await this.getFileContent(file.hash);
            console.log(fileContent);
            if (commitData.parentCommit) {
                const parentCommitData = JSON.parse(await this.getCommitData(commitData.parentCommit));
                const parentFileContent = await this.getParentFileContent(parentCommitData, file.path);
                if (parentFileContent !== undefined) {
                    console.log("\nDiff:");
                    const diff = diffLines(parentFileContent, fileContent);
                    //console.log(diff)
                    diff.forEach(part => {
                        if (part.added) {
                            process.stdout.write(chalk.green("++",part.value));
                        } else if (part.removed) {
                            process.stdout.write(chalk.red("--",part.value));
                        } else {
                            process.stdout.write(chalk.gray(part.value));
                        }
                        console.log();
                    });
                    
                } else {
                    console.log("New file in this commit");
                }
            } else {
                console.log("First commit");
            }
        }
    }

    async getCommitData(commitHash) {
        const commitPath = path.join(this.objectPath, commitHash);
        try {
            return await fs.readFile(commitPath, { encoding: 'utf-8' });
        } catch (error) {
            console.log("Failed to read commit data", error);
            return null;
        }
    }

    async getParentFileContent(parentCommitData, filePath) {
        const parentFile = parentCommitData.files.find(file => file.path === filePath);
        if (parentFile) {
            return await this.getFileContent(parentFile.hash);
        }
    }

    async getFileContent(fileHash) {
        const objectPath = path.join(this.objectPath, fileHash);
        return fs.readFile(objectPath, { encoding: 'utf-8' });
    }
}

(async () => {
    const grove = new Grove();
    await grove.add('sample.txt');
    await grove.add('sample2.txt');
    await grove.commit('4th commit');
    await grove.log();
    //await grove.showCommitDiff('017340897e69e57f11b5a624b96f810e3810d843');
})();
