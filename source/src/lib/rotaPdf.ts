import { jsPDF } from 'jspdf'
import { addDays,endOfMonth,format,parseISO,startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment,Consultation,Staff } from '../types'
import { getPlanning } from './planningConfig'
import { absenceAppearance, isAbsence } from './absences'

type ShiftBand = 'morning' | 'afternoon'

const overlapsBand = (start: string, end: string, bandStart: string, bandEnd: string) =>
  start.slice(0,5) < bandEnd && end.slice(0,5) > bandStart

const isInBand = (assignment: Assignment, band: ShiftBand) =>
  band === 'morning'
    ? overlapsBand(assignment.start_time, assignment.end_time, '08:00', '15:00')
    : overlapsBand(assignment.start_time, assignment.end_time, '15:00', '20:00')

export function createRotaPdf(month:string,staff:Staff[],assignments:Assignment[],consultations:Consultation[],updatedAt:Date=new Date(),publicationLabel='') {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'})
 const margin=12
 const pageWidth=420
 const pageHeight=297
 const tableWidth=396
 const nameWidth=43
 const dates:string[]=[]
 for(let d=startOfMonth(parseISO(month+'-01'));d<=endOfMonth(d)&&format(d,'yyyy-MM')===month;d=addDays(d,1))dates.push(format(d,'yyyy-MM-dd'))
 const cellWidth=(tableWidth-nameWidth)/dates.length
 const legendColumns=4
 const legendRows=Math.max(1,Math.ceil(consultations.length/legendColumns))
 const legendHeight=8+legendRows*6+7
 const footerY=289
 const legendBottom=footerY-6
 const legendTop=legendBottom-legendHeight
 const startY=34
 const sectionHeaderHeight=9
 const dateHeaderHeight=10
 const sectionGap=5
 const availableRowsHeight=Math.max(40,legendTop-startY-(sectionHeaderHeight+dateHeaderHeight)*2-sectionGap)
 const rowHeight=Math.max(4.2,Math.min(10,availableRowsHeight/Math.max(1,staff.length*2)))

 const heading=()=>{
  doc.setFillColor('#245e46');doc.rect(0,0,pageWidth,23,'F')
  doc.setTextColor('#ffffff');doc.setFont('helvetica','bold');doc.setFontSize(19)
  doc.text(`EndoTurnos | ${format(parseISO(month+'-01'),'MMMM yyyy',{locale:es})}`,margin,14)
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor('#496153')
  doc.text(`${staff.length===1?staff[0].display_name:'Cuadrante del equipo'} · Actualizado ${format(updatedAt,'dd/MM/yyyy HH:mm')}`,margin,29)
 }

 const drawSection=(band:ShiftBand,y:number)=>{
  const label=band==='morning'?'Mañanas':'Tardes'
  const hours=band==='morning'?'08:00–15:00':'15:00–20:00'
  doc.setFillColor(band==='morning'?'#dfeadf':'#d6e5da')
  doc.roundedRect(margin,y,tableWidth,sectionHeaderHeight,2,2,'F')
  doc.setTextColor('#244d38');doc.setFont('helvetica','bold');doc.setFontSize(11)
  doc.text(label,margin+4,y+6)
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor('#587063')
  doc.text(hours,margin+tableWidth-4,y+6,{align:'right'})
  y+=sectionHeaderHeight

  doc.setFillColor('#edf3eb');doc.setDrawColor('#d6e0d5');doc.setLineWidth(.2)
  doc.rect(margin,y,nameWidth,dateHeaderHeight,'FD')
  doc.setTextColor('#2e513c');doc.setFont('helvetica','bold');doc.setFontSize(7.5)
  doc.text('Profesional',margin+2.5,y+6.2)
  dates.forEach((date,i)=>{
   const x=margin+nameWidth+i*cellWidth
   const weekend=[0,6].includes(parseISO(date).getDay())
   const holiday=Boolean(getPlanning().holidays[date])
   doc.setFillColor(holiday?'#fae8e0':weekend?'#f1f3ef':'#edf3eb')
   doc.rect(x,y,cellWidth,dateHeaderHeight,'FD')
   doc.setTextColor('#4d6458');doc.setFont('helvetica','normal');doc.setFontSize(5.8)
   doc.text(format(parseISO(date),'EEE',{locale:es}).slice(0,1).toUpperCase(),x+cellWidth/2,y+3.7,{align:'center'})
   doc.setFont('helvetica','bold');doc.setFontSize(7)
   doc.text(String(Number(date.slice(-2))),x+cellWidth/2,y+8,{align:'center'})
  })
  y+=dateHeaderHeight

  staff.forEach(person=>{
   doc.setFillColor('#f4f7f2');doc.setDrawColor('#d6e0d5')
   doc.rect(margin,y,nameWidth,rowHeight,'FD')
   doc.setTextColor('#254c37');doc.setFont('helvetica','bold');doc.setFontSize(rowHeight<5.5?5.2:6.5)
   const maxNameWidth=person.weekly_minutes<2100?nameWidth-16:nameWidth-4
   doc.text(doc.splitTextToSize(person.display_name,maxNameWidth)[0]??person.display_name,margin+2,y+rowHeight*.62)
   if(person.weekly_minutes<2100){
    doc.setFillColor('#e3eee3');doc.roundedRect(margin+nameWidth-13.5,y+rowHeight*.22,11,rowHeight*.55,.8,.8,'F')
    doc.setTextColor('#456250');doc.setFont('helvetica','bold');doc.setFontSize(4.5)
    doc.text('RED 1/3',margin+nameWidth-8,y+rowHeight*.59,{align:'center'})
   }

   dates.forEach((date,i)=>{
    const x=margin+nameWidth+i*cellWidth
    const weekend=[0,6].includes(parseISO(date).getDay())
    const holiday=Boolean(getPlanning().holidays[date])
    const items=assignments.filter(a=>a.work_date===date&&a.professional_id===person.id&&isInBand(a,band))
    const special=items.find(a=>isAbsence(a.consultation_id))
    const specialVisual=special?absenceAppearance(special.consultation_id):null
    doc.setFillColor(specialVisual?.shade??(holiday?'#fae8e0':weekend?'#f2f3ef':'#ffffff'))
    doc.rect(x,y,cellWidth,rowHeight,'FD')
    if(!items.length)return
    const gap=.35
    const badgeHeight=Math.max(2.2,Math.min(4.6,(rowHeight-gap*(items.length+1))/items.length))
    items.forEach((a,j)=>{
     const c=consultations.find(c=>c.id===a.consultation_id)
     const visual=isAbsence(a.consultation_id)?absenceAppearance(a.consultation_id):null
     if(visual?.className==='rest')return
     const top=y+gap+j*(badgeHeight+gap)
     if(top+badgeHeight>y+rowHeight-.2)return
     doc.setFillColor(visual?.color??c?.color??'#50755a')
     doc.roundedRect(x+.45,top,cellWidth-.9,badgeHeight,.6,.6,'F')
     doc.setTextColor('#ffffff');doc.setFont('helvetica','bold')
     doc.setFontSize(Math.max(3.8,Math.min(6.6,badgeHeight*1.35)))
     doc.text((visual?.symbol??c?.short_label??a.consultation_id.slice(0,5))+(a.is_extra?'*':''),x+cellWidth/2,top+badgeHeight*.7,{align:'center',maxWidth:cellWidth-1.2})
    })
   })
   y+=rowHeight
  })
  return y
 }

 const drawLegend=(y:number)=>{
  doc.setTextColor('#365340');doc.setFont('helvetica','bold');doc.setFontSize(8.5)
  doc.text('Leyenda',margin,y+4)
  const colWidth=tableWidth/legendColumns
  consultations.filter(c=>!isAbsence(c.id)).forEach((c,index)=>{
   const col=index%legendColumns
   const row=Math.floor(index/legendColumns)
   const x=margin+col*colWidth
   const lineY=y+9+row*6
   doc.setFillColor(c.color);doc.roundedRect(x,lineY-3.1,5,3.5,.7,.7,'F')
   doc.setTextColor('#355043');doc.setFont('helvetica','bold');doc.setFontSize(6.5)
   doc.text(c.short_label,x+7,lineY-.4)
   doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.setTextColor('#607166')
   doc.text(c.label,x+18,lineY-.4,{maxWidth:colWidth-20})
  })
  const specialY=y+9+Math.ceil(consultations.filter(c=>!isAbsence(c.id)).length/legendColumns)*6
  const specials=[['VAC','Vacaciones'],['PER','Permiso'],['FOR','Formación'],['','Descanso']]
  specials.forEach((item,index)=>{const visual=absenceAppearance(index===0?'VAC':index===1?'PERM':index===2?'FOR':'DESCANSO');const x=margin+index*colWidth;doc.setFillColor(visual.shade);doc.roundedRect(x,specialY-3.1,5,3.5,.7,.7,'F');doc.setTextColor('#355043');doc.setFont('helvetica','bold');doc.setFontSize(6.3);doc.text(item[0]||'—',x+7,specialY-.4);doc.setFont('helvetica','normal');doc.text(item[1],x+18,specialY-.4)})
  const noteY=specialY+6
  doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor('#647368')
  doc.text('Sombreado verde: VAC · malva: PER · naranja: FOR · gris: descanso · Fondo salmón: festivo · * Consulta extra.',margin,noteY)
 }

 const footer=()=>{
  doc.setTextColor('#647368');doc.setFont('helvetica','normal');doc.setFontSize(7)
  doc.text(`${publicationLabel ? publicationLabel+' · ' : ''}Uso interno · Los cambios posteriores no aparecen en esta copia.`,margin,footerY)
 }

 heading()
 let y=startY
 y=drawSection('morning',y)
 y+=sectionGap
 y=drawSection('afternoon',y)
 drawLegend(Math.max(y+4,legendTop))
 footer()
 return doc
}

export function downloadRotaPdf(month:string,staff:Staff[],assignments:Assignment[],consultations:Consultation[],updatedAt:Date,publicationLabel=''){
 createRotaPdf(month,staff,assignments,consultations,updatedAt,publicationLabel).save(`EndoTurnos_${month}_${staff.length===1?'individual':'equipo'}.pdf`)
}
