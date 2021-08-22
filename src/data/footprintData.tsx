import {Archive, CallMerge, GitHub, ImportExport, LinearScale} from "@material-ui/icons";

interface Action {
    name: string,
    icon: JSX.Element,
    link: string,
    disabled?: boolean
}

interface CardItems {
    secondary: string,
    upperIcon: JSX.Element,
    main: string,
    description: string,
    actions: Action[],
}

const footprintItems: CardItems[] = [
    {
        secondary: "co-authored with arkworks open-source contributors",
        upperIcon: <CallMerge/>,
        main: "An R1CS Friendly Merkle Tree Implementation",
        description: "Implementation of Merkle Tree using provided or user-defined hash functions." +
            " R1CS arithmetic circuit for merkle tree path verification. Support for different two-to-one hashes and leaf hashes.",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/arkworks-rs/crypto-primitives"},
            {name: "Crate", icon: <Archive/>, link: "https://crates.io/crates/ark-crypto-primitives"}
        ]
    },
    {
        secondary: "alpha release",
        upperIcon: <LinearScale/>,
        main: "Low Degree Testing for Reed Solomon Code",
        description: "FRI protocol to enforce degree bound of univariate oracle evaluations. Generate succinct proof with size O(Log(degree))." +
            " Come with arithmetic circuit for verifier round function.",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/arkworks-rs/ldt"},
            {name: "Crate", icon: <Archive/>, link: "#", disabled: true}
        ]
    },
    {
        secondary: "work in progress",
        upperIcon: <ImportExport/>,
        main: "Backend communication server for Federated Learning",
        description: "An asynchronous multi-threaded communication server for federated learning research project." +
            " Support 16000+ concurrent active connections and high bandwidth. ",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "#", disabled: true},
        ]
    }
]

export {footprintItems};
