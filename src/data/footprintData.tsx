import {Archive, CallMerge, Class, Description,  GitHub, ImportExport, LinearScale, Link} from "@material-ui/icons";

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
        secondary: "In Proceedings of IEEE S&P 2023",
        upperIcon: <ImportExport/>,
        main: "ELSA",
        description: "Secure Multi-Party Aggregation for Federated Learning with Malicious Actor",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/ucbsky/elsa", disabled: false},
            {name: "Eprint", icon: <Description/>, link: "https://eprint.iacr.org/2022/1695", disabled: false}
        ]
    },
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
]

export {footprintItems};
