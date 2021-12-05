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
        secondary: "alpha release (breaking change pending, use with caution)",
        upperIcon: <Link/>,
        main: "Rust Library for Interactive Oracle Proofs",
        description: "Implementations of public coin RS-IOP and BCS Transform. " +
        "Compile any interactive RS-IOP to non-interactive, succinct proof. Convert any public coin IOP-based verifier to R1CS constraints. ",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/arkworks-rs/bcs"},
            {name: "Tutorial", icon: <Class/>, link: "https://github.com/arkworks-rs/bcs/blob/main/examples/sumcheck/README.md", disabled: false},
            {name: "Crate", icon: <Archive/>, link: "#", disabled: true}
        ]
    },
    {
        secondary: "work in progress with two other graduate students",
        upperIcon: <ImportExport/>,
        main: "Eiffel: Secure Federated Learning System",
        description: "A new asynchronous multi-threaded communication protocol that has less MPC communication and resists arbitrary gradient poisoning",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "#", disabled: true},
            {name: "Paper", icon: <Description/>, link: "#", disabled: true}
        ]
    }
]

export {footprintItems};
