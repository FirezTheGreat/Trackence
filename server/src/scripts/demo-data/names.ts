/**
 * Curated, region-coherent Indian name pools for the demo dataset.
 * Every person generated from these is fictional; emails are always @example.com.
 */

export type NameGroup = {
    region: string;
    weight: number;
    male: string[];
    female: string[];
    surnames: string[];
    femaleSurnames?: string[];
};

export const NAME_GROUPS: NameGroup[] = [
    {
        region: "north",
        weight: 24,
        male: ["Aarav", "Vivaan", "Aditya", "Arjun", "Kabir", "Rohan", "Ayush", "Harsh", "Kunal", "Nikhil", "Raghav", "Shivam", "Utkarsh", "Yash", "Dhruv", "Ansh", "Aryan", "Pranjal"],
        female: ["Ananya", "Ishita", "Aditi", "Shreya", "Riya", "Tanvi", "Muskan", "Khushi", "Sakshi", "Pooja", "Nidhi", "Vaishnavi", "Simran", "Anushka", "Palak", "Garima"],
        surnames: ["Sharma", "Verma", "Gupta", "Mishra", "Pandey", "Tiwari", "Srivastava", "Saxena", "Agarwal", "Chauhan", "Yadav", "Tripathi", "Dubey", "Rastogi", "Bansal", "Mittal"],
    },
    {
        region: "punjabi",
        weight: 7,
        male: ["Harpreet", "Gurpreet", "Jaskaran", "Manveer", "Arshdeep", "Karan", "Sahil", "Rajat"],
        female: ["Simran", "Harleen", "Jasleen", "Navneet", "Gurleen", "Mehak", "Ishmeet"],
        surnames: ["Singh", "Gill", "Sandhu", "Dhillon", "Grewal", "Kapoor", "Malhotra", "Khanna", "Arora", "Chopra"],
        femaleSurnames: ["Kaur", "Gill", "Sandhu", "Dhillon", "Grewal", "Kapoor", "Malhotra", "Khanna", "Arora", "Chopra"],
    },
    {
        region: "south-tamil",
        weight: 11,
        male: ["Karthik", "Arvind", "Vignesh", "Pranav", "Hari", "Srinivas", "Ashwin", "Gokul", "Surya", "Naveen", "Balaji"],
        female: ["Divya", "Keerthana", "Lakshmi", "Meenakshi", "Harini", "Janani", "Swathi", "Nithya", "Sowmya", "Aishwarya"],
        surnames: ["Iyer", "Iyengar", "Krishnan", "Subramanian", "Raghavan", "Venkatesan", "Sundaram", "Ramachandran", "Natarajan", "Balasubramanian"],
    },
    {
        region: "south-telugu",
        weight: 9,
        male: ["Sai Teja", "Venkat", "Rahul", "Abhiram", "Charan", "Vamsi", "Manikanta", "Lokesh", "Sriram"],
        female: ["Sravani", "Bhavana", "Harika", "Lasya", "Mounika", "Sahithi", "Deepika", "Pranathi"],
        surnames: ["Reddy", "Rao", "Naidu", "Chowdary", "Varma", "Kumar", "Prasad", "Goud"],
    },
    {
        region: "south-kannada",
        weight: 8,
        male: ["Pranav", "Sudeep", "Rakshith", "Chirag", "Akash", "Nishanth", "Darshan", "Tejas"],
        female: ["Ananya", "Spoorthi", "Sinchana", "Bhoomika", "Prarthana", "Anagha", "Shravya"],
        surnames: ["Hegde", "Shetty", "Kamath", "Bhat", "Pai", "Rao", "Gowda", "Shenoy", "Acharya"],
    },
    {
        region: "kerala",
        weight: 7,
        male: ["Arjun", "Vishnu", "Akhil", "Gautham", "Nandu", "Sreehari", "Abhinav"],
        female: ["Anjali", "Gayathri", "Parvathy", "Aparna", "Devika", "Athira", "Lekshmi"],
        surnames: ["Nair", "Menon", "Pillai", "Kurup", "Warrier", "Panicker", "Nambiar"],
    },
    {
        region: "bengali",
        weight: 10,
        male: ["Arnab", "Sourav", "Debjit", "Ritwik", "Sayan", "Anirban", "Subhajit", "Rohit", "Aritra"],
        female: ["Ankita", "Sneha", "Riya", "Debolina", "Srijita", "Payel", "Tanushree", "Moumita", "Oindrila"],
        surnames: ["Banerjee", "Chatterjee", "Mukherjee", "Ghosh", "Bose", "Sen", "Das", "Dutta", "Chakraborty", "Roy", "Sarkar", "Bhattacharya"],
    },
    {
        region: "east",
        weight: 5,
        male: ["Subham", "Ashutosh", "Bikash", "Pritam", "Debashish", "Rituraj"],
        female: ["Smruti", "Ipsita", "Swagatika", "Nandini", "Trishna", "Barnali"],
        surnames: ["Mohanty", "Patnaik", "Sahoo", "Dash", "Mishra", "Barua", "Bora", "Hazarika", "Kalita"],
    },
    {
        region: "west",
        weight: 11,
        male: ["Aditya", "Omkar", "Siddharth", "Tanmay", "Parth", "Hrishikesh", "Nirav", "Jay", "Dhaval", "Mihir", "Chinmay"],
        female: ["Sanika", "Mrunal", "Rutuja", "Isha", "Janhvi", "Krupa", "Dhwani", "Prachi", "Shruti", "Aarya"],
        surnames: ["Kulkarni", "Deshpande", "Joshi", "Patil", "Gokhale", "Shinde", "Patel", "Shah", "Desai", "Mehta", "Trivedi", "Parikh"],
    },
    {
        region: "muslim",
        weight: 6,
        male: ["Aamir", "Faizan", "Zaid", "Imran", "Rehan", "Arham", "Sameer", "Danish"],
        female: ["Ayesha", "Sana", "Zoya", "Fatima", "Mehreen", "Alina", "Rukhsar"],
        surnames: ["Khan", "Siddiqui", "Ansari", "Qureshi", "Shaikh", "Mirza", "Hussain"],
    },
    {
        region: "christian",
        weight: 2,
        male: ["Joel", "Aaron", "Kevin", "Allen", "Jerin"],
        female: ["Sharon", "Neha", "Rachel", "Ann", "Teresa"],
        surnames: ["D'Souza", "Fernandes", "Pereira", "Thomas", "George", "Mathew", "Kurian"],
    },
];
