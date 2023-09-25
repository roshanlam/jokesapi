import * as readline from "node:readline/promises";
import fs from 'fs';

import {fetchJSON} from './utils.ts';

/**
 * @description: A program that uses a joke api to get jokes and return jokes similar to the user's liking 
 * by using cosine similarity where the jokes the user likes is saved in the json file. 
 * The program also generates a report of their joke ratings and what they categories of jokes they liked and lastly 
 * allows the user an option to clear their data and start over or keep their data and exit the program.  
 * NOTICE: IF YOU TERMINATE THE PROGRAM EARLY, PLEASE DELETE THE JOKES.JSON AND CACHE JSON FILE IT CREATES OR THE NEXT ITERATION 
 * WILL RUN IMPROPERLY
 */

// the url is configured to return a joke that is not nsfw, religious, political, racist, sexist, or explicit 
const url = "https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,religious,political,racist,sexist,explicit"
export interface Joke{
    id: number
    type: string,
    joke: string,
    setup: string | null,
    delivery: string | null,
    category: string,
    UserRating: boolean | null,
}

interface JokeResponse {
    type: string;
    joke: string;
    setup: string;
    delivery: string;
    category: string;
    id: number;
}

export interface UserReport{
    UserRating: {
        likes: number,
        dislikes: number,
    };

    categories: {
        liked: string[],
        disliked: string[],
    };
}

// handles the different types of jokes since there is a one part and two part joke
const handleJokes = (json: any | JokeResponse) => json.type === 'single' ? "\n" + json.joke : "\n" + json.setup + "\n" + json.delivery;

// searches for jokes using the url
const searchJokes = (url: string): Promise<Joke> => 
    fetchJSON(url).then(json => {
        const joke = {id: json.id, type: json.type, setup: json.setup ?? null, delivery: json.delivery ?? null, joke: handleJokes(json), category: json.category, UserRating: null}
        return joke;
    });

// gets the jokes from the json file
function getJokes(): Joke[]{
    const data = fs.readFileSync('src/jokes.json', 'utf-8');
    return JSON.parse(data) as Joke[];
}

// gets the joke ratings from the json file
function getJokeRatings(): Joke[] {
return openJSON('src/jokes.json')
}

/**
 * @description: A class that saves the joke ratings to the json file and generates a report of the user's joke ratings
 */
export class UserRating{
    constructor(public joke: Joke, public rating: boolean, public generate: boolean){
        this.joke = joke;
        this.rating = rating;
        this.generate = generate;
    }
    
    public toString(): string{
        return `${this.joke} ${this.rating}`
    }

    public saveJokeRating(){
      let rateJoke: Joke = {} as Joke;
        if(this.joke.type === "single"){
            rateJoke = {
                id: this.joke.id,
                type: this.joke.type,
                joke: this.joke.joke,
                setup: this.joke.setup,
                delivery: this.joke.delivery,
                category: this.joke.category,
                UserRating: this.rating
            }
        }else if(this.joke.type === "twopart"){
            rateJoke = {
                id: this.joke.id,
                type: this.joke.type,
                setup: this.joke.setup,
                delivery: this.joke.delivery,
                joke: this.joke.setup + "\n" + this.joke.delivery,
                category: this.joke.category,
                UserRating: this.rating
            }
        }
        saveJSON(rateJoke as Joke, 'src/jokes.json');
    }

    public generateData() {
        const jokes = getJokes();
        const userReport: UserReport = {
            UserRating: {
                likes: 0,
                dislikes: 0,
            },
            categories: {
                liked: [],
                disliked: [],
            }
        }

        jokes.forEach((joke) => {
            if(joke.UserRating){
                userReport.UserRating.likes++;
                userReport.categories.liked.push(joke.category);
            }else{
                userReport.UserRating.dislikes++;
                userReport.categories.disliked.push(joke.category);
            }
        });
        userReport.categories.liked = removeDuplicates(userReport.categories.liked); 
        userReport.categories.disliked = removeDuplicates(userReport.categories.disliked);
        fs.writeFileSync('src/user_report.json', JSON.stringify(userReport, null, 2));
    }
    
    
    public getJokeReport() {
       const reportData = openJSON('src/user_report.json');
       return reportData;
    }
}

/**
 * 
 * @param joke 
 * @param jokeRatings
 * @returns a joke recommendation based on the user's joke ratings being a joke that is similar to the user's liked jokes 
 * by 30% or more
 */
export async function getJokeRecommendation(joke: Joke, jokeRatings: Joke[]) {
    const categoriesLiked = jokeRatings.filter(joke =>joke.UserRating ).map(joke=>joke.category);
    const categoryParam = categoriesLiked.join(",");
    const burl = `https://v2.jokeapi.dev/joke/${categoryParam}/contains=Any`;
    const zurl = burl;
    const similarJokes: Joke[] = [];
    const response = await fetchJSON<JokeResponse>(zurl);
    
    if (response.type === "single") {
        const similarityScore = jokeSimilarity(response.joke, joke.joke);
        if (similarityScore >= 0.3) { 
          return response;
        }
      } else if (response.type === "twopart") {
        const similarityScoreSetup = jokeSimilarity(response.setup, joke.joke);
        const similarityScoreDelivery = jokeSimilarity(response.delivery, joke.joke);
        if (similarityScoreSetup >= 0.3 && similarityScoreDelivery >= 0.3) {
          return response;
        }
      }
    return response;
  }

// asks the user for input and returns the joke, joke ratings, joke report and clears the data if the user wants to
const askUser = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    let searchTerm = await rl.question('What word would you like to search for? ');
    console.log(`Searching for jokes containing ${searchTerm}...`);
    let joke = await searchJokes(url + `&contains=${searchTerm}`);

    while(joke.category===undefined){
        console.log("joke not found, search for another term")
        searchTerm = await rl.question('What word would you like to search for? ');
        console.log(`Searching for jokes containing ${searchTerm}...`);
        joke = await searchJokes(url + `&contains=${searchTerm}`);
    }

    console.log(joke.joke);

    const rating = await rl.question('Did you like the joke? (y/n) ');
    
    
    if (rating === 'y' || rating === 'n') {
        const userRating = new UserRating(joke as Joke, true, false);
        userRating.saveJokeRating();
    }

    let moreJokes = await rl.question('Would you like to see more jokes? (y/n) ');
    while(moreJokes !== 'y' && moreJokes!== 'n'){
        console.log("invalid input, please use either y or n")
        moreJokes = await rl.question('Would you like to see more jokes? (y/n) ');
    }
    while (moreJokes === 'y') {
        const jokeRecommendation = await getJokeRecommendation(joke, getJokeRatings());
        console.log(handleJokes(jokeRecommendation));
        const to_save: Joke = {
          id: jokeRecommendation.id,
          joke: jokeRecommendation.joke,
          type: jokeRecommendation.type,
          setup: jokeRecommendation.setup ?? null,
          delivery: jokeRecommendation.delivery ?? null,
          category: jokeRecommendation.category,
          UserRating: true
        }
        let rating = await rl.question('Did you like the joke? (y/n) ');
        while(rating!== 'y' && rating!== 'n'){
            console.log("invalid input, please use either y or n")
            rating = await rl.question('Did you like the joke? (y/n)  ');
        }
        if (rating === 'y' || rating === 'n') {
            const userRating = new UserRating(to_save, true, false);
            userRating.saveJokeRating();
        }
        moreJokes = await rl.question('Would you like to see more jokes? (y/n) ');

    }

    console.log("here is your report")
    const userRating = new UserRating(joke as Joke, true, true)
    userRating.generateData()
    console.log(fs.readFileSync('src/user_report.json', 'utf-8'));

    let clearData = await rl.question('Would you like to clear your data and start over? (y/n) ');
    while(clearData!=="y" && clearData!=="n"){
        console.log("invalid input, please enter either y or n")
        clearData = await rl.question('Would you like to clear your data and start over? (y/n) ');
    }
    if (clearData === 'y') {
        fs.unlinkSync('src/jokes.json');
        fs.unlinkSync('src/user_report.json');
        console.log('Data cleared');
    }else if (clearData === 'n') {
        console.log('Enjoy your jokes :)');
    }
    rl.close();
};

askUser();


// Removes duplicates from an array of type T
export function removeDuplicates<T>(arr: T[]): T[]{
    return Array.from(new Set(arr));
  }
  
  /**
   * 
   * @param string 
   * @returns Map<string, number> 
   * 
   * what is does is split the string into an array of words, then it creates a map where the key 
   * is the word and the value is the number of times it appears in the string
   */
  export function word_count_map(string: string){
    const words = string.split(" ");
    const word_count = new Map<string, number>();
    for (const word of words){
      if (word_count.has(word)){
        word_count.set(word, (word_count.get(word) as number) + 1);
      } else {
        word_count.set(word, 1);
      }
    }
    return word_count;
  }
  
  // adds all the words in the wordCountMap to the dictionary
  export function addWordsToDictionary(wordCountmap: Map<string, number>, dict: Map<string, boolean>){
    for(const key of wordCountmap.keys()){
        dict.set(key, true);
    }
  }
  
  // creates a vector of the word counts of the words in the wordCountMap
  export function mapToVector(wordCountMap: Map<string, number>, dict: Map<string, boolean>): number[]{
    const wordVector: number[] = [];
    for(const term in dict){
      if(wordCountMap.has(term)){
        wordVector.push(wordCountMap.get(term) as number);
      } else {
        wordVector.push(0);
      }
    }
    return wordVector;
  }
  
  // calculates the dot product of 2 vectors
  export function dotProduct(vecA: number[], vecB: number[]): number{
    let product = 0;
    for(let i = 0; i < vecA.length; i++){
      product += vecA[i] * vecB[i];
    }
    return product;
  }
  
  // calculates the magnitude of a vector
  export function magnitude(vec: number[]): number{
    let sum = 0;
    for(const item of vec){
      sum += item * item;
    }
    return Math.sqrt(sum);
  }
  
  // calculates the cosine similarity of 2 vectors
  export function cosineSimilarity(vecA: number[], vecB: number[]): number{
    return dotProduct(vecA, vecB) / (magnitude(vecA) * magnitude(vecB));
  }
  
  // calculates the similarity of 2 jokes
  export function jokeSimilarity(jokeA: string, jokeB: string): number{
    const wordCountA = word_count_map(jokeA.toLocaleLowerCase());
    const wordCountB = word_count_map(jokeB.toLocaleLowerCase());
    const dict = new Map<string, boolean>();
    addWordsToDictionary(wordCountA, dict);
    addWordsToDictionary(wordCountB, dict);
    const jokeAVector = mapToVector(wordCountA, dict);
    const jokeBVector = mapToVector(wordCountB, dict);
    return cosineSimilarity(jokeAVector, jokeBVector);
  }
  
  // saves the joke to the json file 
  export function saveJSON(data: Joke, fileName: string): void {
    let fileData: Joke[] = [];
    if (fs.existsSync(fileName)) {
      const existingData = fs.readFileSync(fileName, 'utf-8');
      try {
        fileData = JSON.parse(existingData) as Joke[];
      }catch (err) {
        throw new Error(`Error parsing file ${fileName}: ${err as string}`);
      }
      const isDuplicate = fileData.some((content) => content.id === data.id);
      if (isDuplicate) {
        return;
      }
    }
    fileData.push(data);
    try {
      fs.writeFileSync(fileName, JSON.stringify(fileData, null, 2));
      console.log(`Data saved to ${fileName}`);
    }catch (err) {
      throw new Error(`Error writing file ${fileName}: ${err as string}`);
    }
  }
  
  // opens the json file and returns the data as an array of type T
  export function openJSON<T>(filename: string): T[] {
    let data: T[] = [];
    try {
      data = JSON.parse(fs.readFileSync(filename, "utf-8")) as T[];
    } catch {
      throw new Error(`Error parsing file ${filename}`);
    }
  
    return data;
  }
