import { Code, Computer, School, Work } from "@material-ui/icons"

interface BackgroundEntry {
    time: string | number,
    icon: JSX.Element,
    icon_color?: "inherit" | "grey" | "primary" | "secondary" | undefined,
    header: string,
    main: string,
    end?: boolean
}

export const entries: BackgroundEntry[] = [
    {
        time: `2018`,
        icon: <School />,
        icon_color: "primary",
        header: `Computer Science BA (2018-2022)`,
        main: `UC Berkeley`,
    },
    {
        time: `2021`,
        icon: <Work />,
        icon_color: "primary",
        header: `Intern (Backend)`,
        main: `Arista`,
    },
    {
        time: `2020`,
        icon: <Computer />,
        icon_color: "primary",
        header: `Undergraduate Research`,
        main: `arkworks & RISELab/SkyLab`,
    },
    {
        time: `2022`,
        icon: <School />,
        icon_color: "primary",
        header: `MSCS`,
        main: `Stanford`,
        end: true
    },

]