
// ----------------------------------------------------------------------------
// CENTRAL DATABASE FILE THAT DEFINES THE DEFAULT SYSTEM CONFIGURATION
// ----------------------------------------------------------------------------
let sysJSON = {
    "UUI" : {}, // User Interface: 
    "RUI" : {}, // Reading Interface: flag mgmt, reader types
    "WUI" : {}, // Writing: tool, 
    "AUI" : {}, // Admin: auth profiles, config, feedback, 
}


// ----------------------------------------------------------------------------
// F   I   L   E       D   E   V   E   L   O   P   M   E   N   T
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Initial Account Object - simple object created and transmitted during 
//          registration to reserve user token
// 
// Complete Account Object - after registration, all required and some optional
//          fields are complete, 
// 
//          User Config Object - training, customization, subscription, notebook, 
//        **Reader Config Object - customization, custom flags, interests, genres
//        **Writer Config Object - project template
//       ***Admin Config Object - 
// 
//        **These are included if purchased during registration
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// ----------------------------------------------------------------------------

let userJSON = [
    {"????????????????": { // User Token ID:  
        "UUI" : { // User AuthID: account, custom resources (thesaurus/words, dictionary/short def, encyclopedia/long def)
            "account":{},
            "resources":{
                
            }
        }, 
        "RUI" : {}, // Reading AuthID: 
        "WUI" : {}, // Writing AuthID: 
        "AUI" : {}, // Admin AuthID: 
    }},
    {"??????" : {
        "project" : {},
        "outline" : {},
        "draft" : {},
        "revisions" : {},
        "versionHistory" : {}
    }},
    {"VAMPYR" : {}}
]

export default userJSON;