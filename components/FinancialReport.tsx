import React, {useMemo} from "react";

import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
} from "react-native";


import {
    BarChart,
    PieChart
} from "react-native-chart-kit";



interface Transaction {
    id?: string;
    type: "income" | "expense";
    amount: string;
    category?: string;
    date?: string;
}



interface Props {
    transactions: Transaction[];
}


const FinancialReport = ({transactions}: Props)=>{
    /*
        Calculate financial summary
    */
    const summary = useMemo(()=>{
        let totalIncome = 0;
        let totalExpense = 0;

        transactions.forEach((item)=>{
            if(item.type === "income"){
                totalIncome += Number(item.amount);
            }
            else if(item.type === "expense"){
                totalExpense += Number(item.amount);
            }
        });

        return {
            income: totalIncome,
            expense: totalExpense,
            balance:
            totalIncome - totalExpense
        };
    },[transactions]);

    /*
        Income vs Expense Chart
    */

    const barChartData = {
        labels:[
            "Income",
            "Expense"
        ],

        datasets:[
            {
                data:[
                    summary.income,
                    summary.expense
                ]
            }
        ]
    };

    /*
        Expense Category Calculation
    */

    const categoryData = useMemo(()=>{
        const categories:any = {};
        transactions
        .filter(
            item=>item.type==="expense"
        )

        .forEach(item=>{
            const category =
            item.category || "Others";

            categories[category] =
            (categories[category] || 0)
            +
            Number(item.amount);

        });

        return Object.keys(categories)
        .map((category,index)=>({
            name:category,
            amount:
            categories[category],
            color:
            [
                "#4F46E5",
                "#16A34A",
                "#DC2626",
                "#F59E0B",
                "#9333EA"
            ][index % 5],
            legendFontColor:"#333",
            legendFontSize:13
        }));
    },[transactions]);
return (

<ScrollView
showsVerticalScrollIndicator={false}
style={styles.container}
>

<Text style={styles.header}>
Financial Report
</Text>

<Text style={styles.subtitle}>
Overview of your financial performance
</Text>

<View style={styles.cardContainer}>

<SummaryCard
title="Total Income"
value={summary.income}
color="#16A34A"
/>

<SummaryCard
title="Total Expense"
value={summary.expense}
color="#DC2626"
/>

<SummaryCard
title="Balance"
value={summary.balance}
color="#2563EB"
/>

</View>
<Text style={styles.sectionTitle}>
Income vs Expense
</Text>

<View style={styles.chartCard}>
{Platform.OS === "web" ? (
    <WebBarChart income={summary.income} expense={summary.expense} />
) : (
    <BarChart
        data={barChartData}
        width={340}
        height={250}
        fromZero
        chartConfig={chartConfig}
        showValuesOnTopOfBars
        yAxisLabel="RM "
        yAxisSuffix=""
    />
)}
</View>

<Text style={styles.sectionTitle}>
Expense Breakdown
</Text>

<View style={styles.chartCard}>
{
categoryData.length > 0 ?
Platform.OS === "web" ? (
    <WebExpenseBreakdown data={categoryData} />
) : (
    <PieChart
        data={categoryData}
        width={340}
        height={250}
        chartConfig={chartConfig}
        accessor="amount"
        backgroundColor="transparent"
        paddingLeft="15"
    />
)
:
<Text style={styles.empty}>
No expense data available
</Text>
}

</View>
</ScrollView>
);

};

/*
Reusable Summary Card
*/
const SummaryCard = ({
title,
value,
color
}:any)=>{

return(
<View style={styles.summaryCard}>
<Text style={styles.cardTitle}>
{title}
</Text>
<Text
style={[
styles.amount,
{
color:color
}
]
}
>
RM {value.toFixed(2)}
</Text>

</View>
);
};

const chartConfig = {
backgroundGradientFrom:"#FFFFFF",
backgroundGradientTo:"#FFFFFF",
decimalPlaces:0,

color:(opacity=1)=>

`rgba(37,99,235,${opacity})`,

labelColor:(opacity=1)=>

`rgba(0,0,0,${opacity})`,

style:{
borderRadius:20
}
};

// react-native-chart-kit uses SVG text with an `origin` prop. That prop is
// translated to the invalid `transform-origin` DOM property by react-native-
// svg on web, so use plain React Native views for web rendering instead.
const WebBarChart = ({ income, expense }: { income: number; expense: number }) => {
    const maximum = Math.max(income, expense, 1);
    const bars = [
        { label: "Income", value: income, color: "#16A34A" },
        { label: "Expense", value: expense, color: "#DC2626" },
    ];

    return (
        <View style={styles.webChart}>
            <View style={styles.webBars}>
                {bars.map((bar) => (
                    <View key={bar.label} style={styles.webBarColumn}>
                        <Text style={styles.webBarValue}>RM {bar.value.toFixed(2)}</Text>
                        <View style={styles.webBarTrack}>
                            <View
                                style={[
                                    styles.webBar,
                                    { height: `${Math.max((bar.value / maximum) * 100, bar.value > 0 ? 2 : 0)}%`, backgroundColor: bar.color },
                                ]}
                            />
                        </View>
                        <Text style={styles.webBarLabel}>{bar.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

type ExpenseDatum = {
    name: string;
    amount: number;
    color: string;
};

const WebExpenseBreakdown = ({ data }: { data: ExpenseDatum[] }) => {
    const maximum = Math.max(...data.map((item) => item.amount), 1);

    return (
        <View style={styles.webBreakdown}>
            {data.map((item) => (
                <View key={item.name} style={styles.webBreakdownRow}>
                    <View style={styles.webBreakdownHeading}>
                        <View style={[styles.webLegendDot, { backgroundColor: item.color }]} />
                        <Text style={styles.webBreakdownName}>{item.name}</Text>
                        <Text style={styles.webBreakdownAmount}>RM {item.amount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.webBreakdownTrack}>
                        <View
                            style={[
                                styles.webBreakdownBar,
                                { width: `${Math.max((item.amount / maximum) * 100, item.amount > 0 ? 2 : 0)}%`, backgroundColor: item.color },
                            ]}
                        />
                    </View>
                </View>
            ))}
        </View>
    );
};








const styles = StyleSheet.create({


container:{


flex:1,


padding:20,


backgroundColor:"#F8FAFC"


},



header:{


fontSize:28,


fontWeight:"700",


color:"#111827"


},




subtitle:{


marginTop:5,


color:"#6B7280",


fontSize:14


},




cardContainer:{


marginTop:20


},




summaryCard:{


backgroundColor:"#FFFFFF",


padding:20,


borderRadius:18,


marginBottom:12,


shadowColor:"#000",


shadowOpacity:0.08,


shadowRadius:8,


elevation:4


},




cardTitle:{


fontSize:15,


color:"#6B7280"


},




amount:{


fontSize:26,


fontWeight:"700",


marginTop:8


},




sectionTitle:{


fontSize:20,


fontWeight:"700",


marginTop:25,


marginBottom:12,


color:"#111827"


},




chartCard:{


backgroundColor:"#FFFFFF",


borderRadius:20,


padding:10,


alignItems:"center",


elevation:3


},




empty:{


padding:40,


color:"#9CA3AF"


}

,webChart:{
    width:340,
    height:250,
    paddingTop:10,
    paddingHorizontal:20
}

,webBars:{
    flex:1,
    flexDirection:"row",
    alignItems:"flex-end",
    justifyContent:"space-around",
    borderBottomWidth:1,
    borderBottomColor:"#CBD5E1"
}

,webBarColumn:{
    height:"100%",
    width:100,
    alignItems:"center",
    justifyContent:"flex-end"
}

,webBarValue:{
    color:"#475569",
    fontSize:11,
    marginBottom:5
}

,webBarTrack:{
    height:"75%",
    width:44,
    justifyContent:"flex-end",
    backgroundColor:"#F1F5F9",
    borderTopLeftRadius:8,
    borderTopRightRadius:8,
    overflow:"hidden"
}

,webBar:{
    width:"100%",
    borderTopLeftRadius:8,
    borderTopRightRadius:8
}

,webBarLabel:{
    color:"#475569",
    fontSize:13,
    marginTop:8,
    marginBottom:8
}

,webBreakdown:{
    width:340,
    minHeight:220,
    justifyContent:"center",
    paddingHorizontal:16
}

,webBreakdownRow:{
    marginVertical:8
}

,webBreakdownHeading:{
    flexDirection:"row",
    alignItems:"center",
    marginBottom:5
}

,webLegendDot:{
    width:10,
    height:10,
    borderRadius:5,
    marginRight:8
}

,webBreakdownName:{
    flex:1,
    color:"#334155",
    fontSize:13
}

,webBreakdownAmount:{
    color:"#475569",
    fontSize:12
}

,webBreakdownTrack:{
    height:8,
    width:"100%",
    backgroundColor:"#F1F5F9",
    borderRadius:4,
    overflow:"hidden"
}

,webBreakdownBar:{
    height:"100%",
    borderRadius:4
}



});





export default FinancialReport;
