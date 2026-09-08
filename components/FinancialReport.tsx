import React, {useMemo} from "react";

import {
    View,
    Text,
    StyleSheet,
    ScrollView
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

</View>

<Text style={styles.sectionTitle}>
Expense Breakdown
</Text>

<View style={styles.chartCard}>
{
categoryData.length > 0 ?
<PieChart
data={categoryData}
width={340}
height={250}
chartConfig={chartConfig}
accessor="amount"
backgroundColor="transparent"
paddingLeft="15"
/>
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



});





export default FinancialReport;